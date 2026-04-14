import { and, eq } from 'drizzle-orm';
import { createTwoFilesPatch } from 'diff';
import { getDb } from '../db/index.js';
import { endpoints, versions } from '../db/schema.js';
import { gitManager } from './git-manager.js';

export interface EndpointDiff {
  endpoint: { path: string; method: string };
  from: { tag: string; typeBlock: string | null; implCode: string | null; implFile: string | null };
  to: { tag: string; typeBlock: string | null; implCode: string | null; implFile: string | null };
  typeDiff: string | null;
  implDiff: string | null;
  summary: 'added' | 'removed' | 'modified' | 'unchanged';
}

export interface EndpointChange {
  path: string;
  method: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
}

function getEndpoint(tag: string, path: string, method: string) {
  const db = getDb();
  const [version] = db.select().from(versions).where(eq(versions.tag, tag)).all();
  if (!version) return null;

  const [ep] = db
    .select()
    .from(endpoints)
    .where(
      and(
        eq(endpoints.versionId, version.id),
        eq(endpoints.path, path),
        eq(endpoints.method, method),
      ),
    )
    .all();

  return ep ?? null;
}

function makeDiff(oldContent: string | null, newContent: string | null, label: string, fromTag: string, toTag: string): string | null {
  const oldText = oldContent ?? '';
  const newText = newContent ?? '';
  if (oldText === newText) return null;
  return createTwoFilesPatch(
    `${label} (${fromTag})`,
    `${label} (${toTag})`,
    oldText,
    newText,
  );
}

/**
 * Compare a specific endpoint between two versions.
 */
export function diffEndpoint(path: string, method: string, fromTag: string, toTag: string): EndpointDiff {
  const fromEp = getEndpoint(fromTag, path, method);
  const toEp = getEndpoint(toTag, path, method);

  let summary: EndpointDiff['summary'];
  if (!fromEp && toEp) {
    summary = 'added';
  } else if (fromEp && !toEp) {
    summary = 'removed';
  } else if (!fromEp && !toEp) {
    summary = 'unchanged'; // doesn't exist in either
  } else if (fromEp!.typeBlock === toEp!.typeBlock && fromEp!.implCode === toEp!.implCode) {
    summary = 'unchanged';
  } else {
    summary = 'modified';
  }

  return {
    endpoint: { path, method },
    from: {
      tag: fromTag,
      typeBlock: fromEp?.typeBlock ?? null,
      implCode: fromEp?.implCode ?? null,
      implFile: fromEp?.implFile ?? null,
    },
    to: {
      tag: toTag,
      typeBlock: toEp?.typeBlock ?? null,
      implCode: toEp?.implCode ?? null,
      implFile: toEp?.implFile ?? null,
    },
    typeDiff: makeDiff(fromEp?.typeBlock ?? null, toEp?.typeBlock ?? null, 'type', fromTag, toTag),
    implDiff: makeDiff(fromEp?.implCode ?? null, toEp?.implCode ?? null, 'impl', fromTag, toTag),
    summary,
  };
}

/**
 * Get raw file diff between two versions.
 */
export async function diffFile(filePath: string, fromTag: string, toTag: string): Promise<string> {
  return gitManager.diffFile(fromTag, toTag, filePath);
}

/**
 * Summary of all endpoint changes between two versions.
 */
export function diffSummary(fromTag: string, toTag: string): { added: EndpointChange[]; removed: EndpointChange[]; modified: EndpointChange[]; unchanged: number } {
  const db = getDb();

  const [fromVersion] = db.select().from(versions).where(eq(versions.tag, fromTag)).all();
  const [toVersion] = db.select().from(versions).where(eq(versions.tag, toTag)).all();

  if (!fromVersion || !toVersion) {
    return { added: [], removed: [], modified: [], unchanged: 0 };
  }

  const fromEndpoints = db.select().from(endpoints).where(eq(endpoints.versionId, fromVersion.id)).all();
  const toEndpoints = db.select().from(endpoints).where(eq(endpoints.versionId, toVersion.id)).all();

  const fromMap = new Map(fromEndpoints.map((e) => [`${e.path}:${e.method}`, e]));
  const toMap = new Map(toEndpoints.map((e) => [`${e.path}:${e.method}`, e]));

  const added: EndpointChange[] = [];
  const removed: EndpointChange[] = [];
  const modified: EndpointChange[] = [];
  let unchanged = 0;

  // Check endpoints in "to" that aren't in "from" (added) or changed
  for (const [key, toEp] of toMap) {
    const fromEp = fromMap.get(key);
    if (!fromEp) {
      added.push({ path: toEp.path, method: toEp.method, status: 'added' });
    } else if (fromEp.typeBlock !== toEp.typeBlock || fromEp.implCode !== toEp.implCode) {
      modified.push({ path: toEp.path, method: toEp.method, status: 'modified' });
    } else {
      unchanged++;
    }
  }

  // Check endpoints in "from" that aren't in "to" (removed)
  for (const [key, fromEp] of fromMap) {
    if (!toMap.has(key)) {
      removed.push({ path: fromEp.path, method: fromEp.method, status: 'removed' });
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Get all versions of a specific endpoint.
 */
export function endpointHistory(path: string, method: string) {
  const db = getDb();

  const allVersions = db.select().from(versions).where(eq(versions.status, 'complete')).all();
  const results: { tag: string; exists: boolean; implCode: string | null; typeBlock: string | null }[] = [];

  for (const version of allVersions) {
    const [ep] = db
      .select()
      .from(endpoints)
      .where(
        and(
          eq(endpoints.versionId, version.id),
          eq(endpoints.path, path),
          eq(endpoints.method, method),
        ),
      )
      .all();

    results.push({
      tag: version.tag,
      exists: !!ep,
      implCode: ep?.implCode ?? null,
      typeBlock: ep?.typeBlock ?? null,
    });
  }

  return results;
}
