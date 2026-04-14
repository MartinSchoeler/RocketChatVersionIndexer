import { Hono } from 'hono';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { endpoints, versions } from '../db/schema.js';

export const searchRoutes = new Hono();

/**
 * GET /search
 * Query params: q (required), version (optional), limit (optional, default 20)
 */
searchRoutes.get('/search', (c) => {
  const db = getDb();
  const q = c.req.query('q');
  const version = c.req.query('version');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

  if (!q) {
    return c.json({ error: 'q query parameter is required' }, 400);
  }

  const searchPattern = `%${q}%`;

  const conditions = [
    or(
      like(endpoints.path, searchPattern),
      like(endpoints.paramType, searchPattern),
      like(endpoints.implCode, searchPattern),
    ),
  ];

  if (version) {
    const [v] = db.select().from(versions).where(eq(versions.tag, version)).all();
    if (!v) return c.json({ error: `Version ${version} not found` }, 404);
    conditions.push(eq(endpoints.versionId, v.id));
  }

  const results = db
    .select({
      path: endpoints.path,
      method: endpoints.method,
      paramType: endpoints.paramType,
      implFile: endpoints.implFile,
      typeFile: endpoints.typeFile,
      versionTag: versions.tag,
    })
    .from(endpoints)
    .innerJoin(versions, eq(endpoints.versionId, versions.id))
    .where(and(...conditions))
    .limit(limit)
    .all();

  return c.json({ query: q, results });
});
