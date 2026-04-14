import { Hono } from 'hono';
import { getIndexedVersions, syncVersions, reindexVersion } from '../core/version-manager.js';
import { gitManager } from '../core/git-manager.js';

export const versionRoutes = new Hono();

versionRoutes.get('/versions', (c) => {
  const indexed = getIndexedVersions();
  return c.json({ versions: indexed });
});

versionRoutes.post('/versions/sync', async (c) => {
  if (!gitManager.isCloned()) {
    return c.json({ error: 'Repository not cloned. Run npm run setup first.' }, 400);
  }
  const result = await syncVersions();
  return c.json(result);
});

versionRoutes.post('/versions/:tag/reindex', async (c) => {
  const tag = c.req.param('tag');
  if (!gitManager.isCloned()) {
    return c.json({ error: 'Repository not cloned. Run npm run setup first.' }, 400);
  }
  await reindexVersion(tag);
  return c.json({ status: 'complete', tag });
});
