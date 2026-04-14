import { serve } from '@hono/node-server';
import { config } from './config.js';
import { initializeDb } from './db/index.js';
import { gitManager } from './core/git-manager.js';
import { createApp } from './server.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('Initializing database...');
  initializeDb();

  if (!gitManager.isCloned()) {
    logger.warn('Repository not cloned. Run "npm run setup" first to clone and index.');
    logger.warn('The server will start but most endpoints will return empty results.');
  }

  const app = createApp();

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info(`Server running at http://localhost:${info.port}`);
    logger.info('API base: /api');
  });
}

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
