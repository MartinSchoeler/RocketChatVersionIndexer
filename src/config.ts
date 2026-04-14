import 'dotenv/config';
import path from 'node:path';

export const config = {
  repoUrl: process.env.REPO_URL || 'https://github.com/RocketChat/Rocket.Chat.git',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  majorVersionsToIndex: parseInt(process.env.MAJOR_VERSIONS || '5', 10),
  port: parseInt(process.env.PORT || '3100', 10),
  dbPath: path.resolve(process.env.DB_PATH || './data/index.sqlite'),
  indexOnStartup: process.env.INDEX_ON_STARTUP !== 'false',

  // Rocket.Chat repo paths
  typingsBasePath: 'packages/rest-typings/src/v1',
  implBasePath: 'apps/meteor/app/api/server/v1',
} as const;

export function getBareRepoPath(): string {
  return path.join(config.dataDir, 'repo');
}
