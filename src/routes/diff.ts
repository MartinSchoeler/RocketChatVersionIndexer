import { Hono } from 'hono';
import { diffEndpoint, diffFile, diffSummary } from '../core/diff-engine.js';

export const diffRoutes = new Hono();

/**
 * GET /diff/endpoint
 * Query params: path, method, from, to
 */
diffRoutes.get('/diff/endpoint', (c) => {
  const path = c.req.query('path');
  const method = c.req.query('method') || 'GET';
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!path || !from || !to) {
    return c.json({ error: 'path, from, and to query parameters are required' }, 400);
  }

  const result = diffEndpoint(path, method, from, to);
  return c.json(result);
});

/**
 * GET /diff/file
 * Query params: path, from, to
 */
diffRoutes.get('/diff/file', async (c) => {
  const filePath = c.req.query('path');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!filePath || !from || !to) {
    return c.json({ error: 'path, from, and to query parameters are required' }, 400);
  }

  const diff = await diffFile(filePath, from, to);
  return c.json({ filePath, from, to, diff });
});

/**
 * GET /diff/summary
 * Query params: from, to
 */
diffRoutes.get('/diff/summary', (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!from || !to) {
    return c.json({ error: 'from and to query parameters are required' }, 400);
  }

  const result = diffSummary(from, to);
  return c.json({ from, to, ...result });
});
