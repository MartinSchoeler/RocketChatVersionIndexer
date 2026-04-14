import { Hono } from 'hono';
import { and, eq, like, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { endpoints, versions } from '../db/schema.js';
import { endpointHistory } from '../core/diff-engine.js';

export const endpointRoutes = new Hono();

/**
 * GET /endpoints
 * Query params: version, search, method, page, limit
 */
endpointRoutes.get('/endpoints', (c) => {
  const db = getDb();
  const version = c.req.query('version');
  const search = c.req.query('search');
  const method = c.req.query('method');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = (page - 1) * limit;

  const conditions = [];

  if (version) {
    const [v] = db.select().from(versions).where(eq(versions.tag, version)).all();
    if (!v) return c.json({ error: `Version ${version} not found` }, 404);
    conditions.push(eq(endpoints.versionId, v.id));
  }

  if (search) {
    conditions.push(like(endpoints.path, `%${search}%`));
  }

  if (method) {
    conditions.push(eq(endpoints.method, method.toUpperCase()));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = db
    .select({
      id: endpoints.id,
      path: endpoints.path,
      method: endpoints.method,
      paramType: endpoints.paramType,
      returnType: endpoints.returnType,
      typeFile: endpoints.typeFile,
      implFile: endpoints.implFile,
      versionTag: versions.tag,
    })
    .from(endpoints)
    .innerJoin(versions, eq(endpoints.versionId, versions.id))
    .where(where)
    .limit(limit)
    .offset(offset)
    .all();

  const [{ total }] = db
    .select({ total: sql<number>`count(*)` })
    .from(endpoints)
    .innerJoin(versions, eq(endpoints.versionId, versions.id))
    .where(where)
    .all();

  return c.json({ endpoints: results, total, page, limit });
});

/**
 * GET /endpoints/:encodedPath
 * Query params: version (required)
 * Path is URL-encoded, e.g. /endpoints/%2Fv1%2Fchannels.create
 */
endpointRoutes.get('/endpoints/:encodedPath{.+}', (c) => {
  const db = getDb();
  const rawPath = c.req.param('encodedPath');
  // The path comes in as e.g. "v1/channels.create" or "/v1/channels.create"
  const endpointPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const version = c.req.query('version');

  // Check if this is a /versions sub-route
  if (endpointPath.endsWith('/versions')) {
    const actualPath = endpointPath.replace(/\/versions$/, '');
    const method = c.req.query('method') || 'GET';
    const history = endpointHistory(actualPath, method);
    return c.json({ path: actualPath, method, versions: history });
  }

  if (!version) {
    return c.json({ error: 'version query parameter is required' }, 400);
  }

  const [v] = db.select().from(versions).where(eq(versions.tag, version)).all();
  if (!v) return c.json({ error: `Version ${version} not found` }, 404);

  const results = db
    .select()
    .from(endpoints)
    .where(
      and(
        eq(endpoints.versionId, v.id),
        eq(endpoints.path, endpointPath),
      ),
    )
    .all();

  if (results.length === 0) {
    return c.json({ error: `Endpoint ${endpointPath} not found in version ${version}` }, 404);
  }

  return c.json({
    version,
    endpoints: results.map((ep) => ({
      path: ep.path,
      method: ep.method,
      paramType: ep.paramType,
      returnType: ep.returnType,
      typeBlock: ep.typeBlock,
      implCode: ep.implCode,
      implConfig: ep.implConfig,
      typeFile: ep.typeFile,
      implFile: ep.implFile,
      implStartLine: ep.implStartLine,
      implEndLine: ep.implEndLine,
    })),
  });
});
