import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { healthRoutes } from './routes/health.js';
import { versionRoutes } from './routes/versions.js';
import { endpointRoutes } from './routes/endpoints.js';
import { diffRoutes } from './routes/diff.js';
import { searchRoutes } from './routes/search.js';

export function createApp() {
  const app = new Hono().basePath('/api');

  app.use('*', cors());
  app.use('*', honoLogger());

  app.route('/', healthRoutes);
  app.route('/', versionRoutes);
  app.route('/', endpointRoutes);
  app.route('/', diffRoutes);
  app.route('/', searchRoutes);

  // Global error handler
  app.onError((err, c) => {
    console.error('Unhandled error:', err);
    return c.json({ error: err.message || 'Internal server error' }, 500);
  });

  return app;
}
