import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { endpoints, versions, indexingLog } from '../db/schema.js';
import { config } from '../config.js';
import { gitManager } from './git-manager.js';
import { parseRestTypings, type ParsedEndpoint } from '../parsers/rest-typings-parser.js';
import { parseImplementation, type ParsedImplementation } from '../parsers/implementation-parser.js';
import { logger } from '../utils/logger.js';

export interface IndexResult {
  tag: string;
  endpointsFound: number;
  typesFound: number;
  implementationsFound: number;
  matched: number;
}

export async function indexVersion(tag: string): Promise<IndexResult> {
  const db = getDb();

  // Get or create version record
  let [version] = db.select().from(versions).where(eq(versions.tag, tag)).all();
  if (!version) {
    const [major, minor, patch] = tag.split('.').map(Number);
    [version] = db.insert(versions).values({ tag, major, minor, patch, status: 'indexing' }).returning().all();
  } else {
    db.update(versions).set({ status: 'indexing' }).where(eq(versions.id, version.id)).run();
  }

  // Create indexing log entry
  const [logEntry] = db.insert(indexingLog).values({
    versionId: version.id,
    startedAt: new Date().toISOString(),
    status: 'running',
  }).returning().all();

  try {
    // Clear existing endpoints for this version (re-index support)
    db.delete(endpoints).where(eq(endpoints.versionId, version.id)).run();

    // Step 1: Parse rest-typings
    logger.info(`[${tag}] Parsing rest-typings...`);
    const typingFiles = await gitManager.listFiles(tag, config.typingsBasePath);
    const tsFiles = typingFiles.filter((f) => f.endsWith('.ts'));

    const allTypedEndpoints: ParsedEndpoint[] = [];
    for (const file of tsFiles) {
      const content = await gitManager.readFile(tag, file);
      if (!content) continue;
      const parsed = parseRestTypings(content, file);
      allTypedEndpoints.push(...parsed);
    }
    logger.info(`[${tag}] Found ${allTypedEndpoints.length} typed endpoints from ${tsFiles.length} files`);

    // Step 2: Parse implementations
    logger.info(`[${tag}] Parsing implementations...`);
    const implFiles = await gitManager.listFiles(tag, config.implBasePath);
    const implTsFiles = implFiles.filter((f) => f.endsWith('.ts'));

    const allImplementations: ParsedImplementation[] = [];
    for (const file of implTsFiles) {
      const content = await gitManager.readFile(tag, file);
      if (!content) continue;
      const parsed = parseImplementation(content, file);
      allImplementations.push(...parsed);
    }
    logger.info(`[${tag}] Found ${allImplementations.length} implementations from ${implTsFiles.length} files`);

    // Step 3: Build implementation lookup map (fullPath → impl)
    const implMap = new Map<string, ParsedImplementation>();
    for (const impl of allImplementations) {
      // Key by fullPath + each method
      for (const method of impl.methods) {
        implMap.set(`${impl.fullPath}:${method}`, impl);
      }
    }

    // Step 4: Merge and store
    let matched = 0;
    const insertedPaths = new Set<string>();

    // First: insert typed endpoints with optional implementation match
    for (const ep of allTypedEndpoints) {
      const key = `${ep.path}:${ep.method}`;
      const impl = implMap.get(key);

      if (impl) matched++;

      db.insert(endpoints).values({
        versionId: version.id,
        path: ep.path,
        method: ep.method,
        paramType: ep.paramType,
        returnType: ep.returnType,
        typeBlock: ep.rawTypeBlock,
        implCode: impl?.handlerCode ?? null,
        implConfig: impl?.config ?? null,
        typeFile: ep.sourceFile,
        implFile: impl?.sourceFile ?? null,
        implStartLine: impl?.startLine ?? null,
        implEndLine: impl?.endLine ?? null,
      }).run();

      insertedPaths.add(key);
    }

    // Second: insert untyped implementations (ones without matching type definitions)
    for (const impl of allImplementations) {
      for (const method of impl.methods) {
        const key = `${impl.fullPath}:${method}`;
        if (insertedPaths.has(key)) continue;

        db.insert(endpoints).values({
          versionId: version.id,
          path: impl.fullPath,
          method,
          paramType: null,
          returnType: null,
          typeBlock: null,
          implCode: impl.handlerCode,
          implConfig: impl.config,
          typeFile: null,
          implFile: impl.sourceFile,
          implStartLine: impl.startLine,
          implEndLine: impl.endLine,
        }).run();

        insertedPaths.add(key);
      }
    }

    const totalEndpoints = insertedPaths.size;

    // Update version record
    db.update(versions).set({
      status: 'complete',
      endpointCount: totalEndpoints,
      indexedAt: new Date().toISOString(),
    }).where(eq(versions.id, version.id)).run();

    // Update log
    db.update(indexingLog).set({
      status: 'success',
      completedAt: new Date().toISOString(),
      endpointsFound: totalEndpoints,
    }).where(eq(indexingLog.id, logEntry.id)).run();

    logger.info(`[${tag}] Indexing complete: ${totalEndpoints} endpoints (${matched} type↔impl matches)`);

    return {
      tag,
      endpointsFound: totalEndpoints,
      typesFound: allTypedEndpoints.length,
      implementationsFound: allImplementations.length,
      matched,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    db.update(versions).set({ status: 'failed' }).where(eq(versions.id, version.id)).run();
    db.update(indexingLog).set({
      status: 'error',
      completedAt: new Date().toISOString(),
      errorMsg,
    }).where(eq(indexingLog.id, logEntry.id)).run();

    logger.error(`[${tag}] Indexing failed: ${errorMsg}`);
    throw err;
  }
}
