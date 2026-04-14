import { config } from '../config.js';
import { initializeDb } from '../db/index.js';
import { gitManager } from '../core/git-manager.js';
import { syncVersions } from '../core/version-manager.js';
import { logger } from '../utils/logger.js';

async function setup() {
  logger.info('=== Rocket.Chat Version Indexer Setup ===');
  logger.info(`Repo URL: ${config.repoUrl}`);
  logger.info(`Data directory: ${config.dataDir}`);
  logger.info(`Major versions to index: ${config.majorVersionsToIndex}`);

  // Step 1: Initialize database
  logger.info('\n[1/3] Initializing database...');
  initializeDb();
  logger.info('Database ready.');

  // Step 2: Clone or fetch the repo
  logger.info('\n[2/3] Ensuring bare clone (this may take several minutes on first run)...');
  await gitManager.ensureBareClone();

  const tags = await gitManager.getAvailableTags();
  logger.info(`Found ${tags.length} version tags. Latest: ${tags[0]}`);

  // Step 3: Index versions
  logger.info('\n[3/3] Indexing versions...');
  const { added, alreadyIndexed } = await syncVersions();

  logger.info('\n=== Setup Complete ===');
  if (added.length > 0) {
    logger.info(`Indexed: ${added.join(', ')}`);
  }
  if (alreadyIndexed.length > 0) {
    logger.info(`Already indexed: ${alreadyIndexed.join(', ')}`);
  }
  logger.info(`\nRun "npm start" to launch the server on port ${config.port}`);
}

setup().catch((err) => {
  logger.error('Setup failed:', err);
  process.exit(1);
});
