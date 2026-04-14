import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { versions } from '../db/schema.js';
import { config } from '../config.js';
import { gitManager } from './git-manager.js';
import { indexVersion } from './endpoint-indexer.js';
import { logger } from '../utils/logger.js';

interface VersionInfo {
  tag: string;
  major: number;
  minor: number;
  patch: number;
}

function parseTag(tag: string): VersionInfo {
  const [major, minor, patch] = tag.split('.').map(Number);
  return { tag, major, minor, patch };
}

/**
 * Determine which versions to index:
 * - Get all stable semver tags
 * - Group by major version
 * - For each major, pick the latest patch
 * - Take the last N majors
 */
export async function getTargetVersions(): Promise<string[]> {
  const tags = await gitManager.getAvailableTags();
  const parsed = tags.map(parseTag);

  // Group by major, pick the latest release per major
  const byMajor = new Map<number, VersionInfo>();
  for (const v of parsed) {
    const existing = byMajor.get(v.major);
    if (!existing || compareSemver(v, existing) > 0) {
      byMajor.set(v.major, v);
    }
  }

  // Sort majors descending, take the configured number
  const majors = [...byMajor.keys()].sort((a, b) => b - a);
  const selectedMajors = majors.slice(0, config.majorVersionsToIndex);

  return selectedMajors.map((m) => byMajor.get(m)!.tag);
}

/**
 * Compare two versions. Returns positive if a > b.
 */
function compareSemver(a: VersionInfo, b: VersionInfo): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Sync versions: determine targets, index any that are missing.
 */
export async function syncVersions(): Promise<{ added: string[]; alreadyIndexed: string[] }> {
  const targets = await getTargetVersions();
  const db = getDb();

  const added: string[] = [];
  const alreadyIndexed: string[] = [];

  for (const tag of targets) {
    const [existing] = db.select().from(versions).where(eq(versions.tag, tag)).all();

    if (existing?.status === 'complete') {
      alreadyIndexed.push(tag);
      continue;
    }

    logger.info(`Indexing version ${tag}...`);
    await indexVersion(tag);
    added.push(tag);
  }

  return { added, alreadyIndexed };
}

/**
 * Force re-index a specific version.
 */
export async function reindexVersion(tag: string): Promise<void> {
  logger.info(`Re-indexing version ${tag}...`);
  await indexVersion(tag);
}

/**
 * Get all indexed versions from the DB.
 */
export function getIndexedVersions() {
  const db = getDb();
  return db.select().from(versions).all();
}
