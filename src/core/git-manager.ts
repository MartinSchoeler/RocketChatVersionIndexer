import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { config, getBareRepoPath } from '../config.js';
import { logger } from '../utils/logger.js';

const exec = promisify(execFile);

const GIT_OPTIONS = { maxBuffer: 50 * 1024 * 1024 }; // 50MB buffer for large outputs

function gitInRepo(...args: string[]) {
  const repoPath = getBareRepoPath();
  return exec('git', [...args], { ...GIT_OPTIONS, cwd: repoPath });
}

export const gitManager = {
  /**
   * Clone the repo as a bare clone, or fetch if already exists.
   */
  async ensureBareClone(): Promise<void> {
    const repoPath = getBareRepoPath();

    if (fs.existsSync(repoPath)) {
      logger.info('Bare repo exists, fetching latest tags...');
      await gitInRepo('fetch', '--tags', '--force');
      logger.info('Tags fetched.');
    } else {
      logger.info(`Cloning bare repo from ${config.repoUrl}...`);
      fs.mkdirSync(repoPath, { recursive: true });
      await exec('git', ['clone', '--bare', config.repoUrl, repoPath], {
        ...GIT_OPTIONS,
        timeout: 600_000, // 10 min timeout for large repo
      });
      logger.info('Bare clone complete.');
    }
  },

  /**
   * Get all available version tags (semver, no prerelease).
   */
  async getAvailableTags(): Promise<string[]> {
    const { stdout } = await gitInRepo('tag', '-l');
    const tags = stdout
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => /^\d+\.\d+\.\d+$/.test(t));

    // Sort by semver descending
    tags.sort((a, b) => {
      const [aMaj, aMin, aPat] = a.split('.').map(Number);
      const [bMaj, bMin, bPat] = b.split('.').map(Number);
      return bMaj - aMaj || bMin - aMin || bPat - aPat;
    });

    return tags;
  },

  /**
   * List files under a directory at a specific tag.
   */
  async listFiles(tag: string, dirPath: string): Promise<string[]> {
    try {
      const { stdout } = await gitInRepo('ls-tree', '-r', '--name-only', tag, dirPath);
      return stdout
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    } catch {
      logger.warn(`Could not list files at ${tag}:${dirPath}`);
      return [];
    }
  },

  /**
   * Read a file's content at a specific tag.
   */
  async readFile(tag: string, filePath: string): Promise<string | null> {
    try {
      const { stdout } = await gitInRepo('show', `${tag}:${filePath}`);
      return stdout;
    } catch {
      logger.debug(`File not found: ${tag}:${filePath}`);
      return null;
    }
  },

  /**
   * Get unified diff between two tags for a specific file.
   */
  async diffFile(tag1: string, tag2: string, filePath: string): Promise<string> {
    try {
      const { stdout } = await gitInRepo('diff', tag1, tag2, '--', filePath);
      return stdout;
    } catch (err: unknown) {
      // git diff returns exit code 1 when there are differences
      if (err && typeof err === 'object' && 'stdout' in err) {
        return (err as { stdout: string }).stdout;
      }
      return '';
    }
  },

  /**
   * Get full diff between two tags (all files).
   */
  async diffTags(tag1: string, tag2: string, pathFilter?: string): Promise<string> {
    try {
      const args = ['diff', '--stat', tag1, tag2];
      if (pathFilter) args.push('--', pathFilter);
      const { stdout } = await gitInRepo(...args);
      return stdout;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'stdout' in err) {
        return (err as { stdout: string }).stdout;
      }
      return '';
    }
  },

  /**
   * Check if the bare repo exists.
   */
  isCloned(): boolean {
    return fs.existsSync(getBareRepoPath());
  },
};
