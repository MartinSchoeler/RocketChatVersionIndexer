import { initializeDb } from '../db/index.js';
import { gitManager } from '../core/git-manager.js';
import { syncVersions } from '../core/version-manager.js';
import { logger } from '../utils/logger.js';

async function reindex() {
  logger.info('=== Re-indexing ===');

  initializeDb();

  if (!gitManager.isCloned()) {
    logger.error('Repository not cloned. Run "npm run setup" first.');
    process.exit(1);
  }

  // Fetch latest tags
  logger.info('Fetching latest tags...');
  await gitManager.ensureBareClone(); // This will fetch if already cloned

  const { added, alreadyIndexed } = await syncVersions();

  logger.info('\n=== Re-index Complete ===');
  if (added.length > 0) {
    logger.info(`Newly indexed: ${added.join(', ')}`);
  }
  if (alreadyIndexed.length > 0) {
    logger.info(`Already up to date: ${alreadyIndexed.join(', ')}`);
  }
}

reindex().catch((err) => {
  logger.error('Re-index failed:', err);
  process.exit(1);
});
