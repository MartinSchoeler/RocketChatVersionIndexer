import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { versions, endpoints } from '../db/schema.js';

export const healthRoutes = new Hono();

healthRoutes.get('/health', (c) => {
  const db = getDb();

  const indexedVersions = db
    .select({ count: sql<number>`count(*)` })
    .from(versions)
    .where(eq(versions.status, 'complete'))
    .all()[0]?.count ?? 0;

  const totalEndpoints = db
    .select({ count: sql<number>`count(*)` })
    .from(endpoints)
    .all()[0]?.count ?? 0;

  return c.json({
    status: 'ok',
    indexedVersions,
    totalEndpoints,
  });
});
