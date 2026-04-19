import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// --- Configuration ---

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3100';

// --- API Client ---

async function callApi(
  path: string,
  params: Record<string, string | number | undefined> = {},
  method: 'GET' | 'POST' = 'GET',
): Promise<unknown> {
  const url = new URL(path, SERVER_URL);

  if (method === 'GET') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' && Object.keys(params).length > 0 ? JSON.stringify(params) : undefined,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json();
}

function success(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function error(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

// --- MCP Server ---

const server = new McpServer({
  name: 'rocketchat-version-indexer',
  version: '1.0.0',
});

// --- Tools ---

server.tool(
  'list_versions',
  'List all indexed Rocket.Chat versions with their status and endpoint counts',
  {},
  async () => {
    try {
      const data = await callApi('/api/versions');
      return success(data);
    } catch (e) {
      return error(`Failed to list versions: ${e instanceof Error ? e.message : e}`);
    }
  },
);

server.tool(
  'search_endpoints',
  'Search Rocket.Chat API endpoints by keyword. Searches across endpoint paths, parameter types, and implementation code.',
  {
    query: z.string().describe('Search term (e.g. "channels", "create", "auth")'),
    version: z.string().optional().describe('Filter to a specific version tag (e.g. "8.3.2")'),
    limit: z.number().optional().default(20).describe('Maximum number of results (default 20, max 100)'),
  },
  async ({ query, version, limit }) => {
    try {
      const data = await callApi('/api/search', { q: query, version, limit });
      return success(data);
    } catch (e) {
      return error(`Search failed: ${e instanceof Error ? e.message : e}`);
    }
  },
);

server.tool(
  'get_endpoint',
  'Get full code context for a specific API endpoint in a specific version. Returns type definitions, implementation code, file locations, and configuration.',
  {
    path: z.string().describe('Endpoint path (e.g. "/v1/channels.create")'),
    version: z.string().describe('Version tag (e.g. "8.3.2")'),
  },
  async ({ path, version }) => {
    try {
      const encodedPath = path.startsWith('/') ? path.slice(1) : path;
      const data = await callApi(`/api/endpoints/${encodedPath}`, { version });
      return success(data);
    } catch (e) {
      return error(`Failed to get endpoint: ${e instanceof Error ? e.message : e}`);
    }
  },
);

server.tool(
  'list_endpoints',
  'List Rocket.Chat API endpoints with optional filtering by version, HTTP method, or path search. Returns paginated results.',
  {
    version: z.string().optional().describe('Filter by version tag (e.g. "8.3.2")'),
    search: z.string().optional().describe('Filter by path pattern (e.g. "channels")'),
    method: z.string().optional().describe('Filter by HTTP method (GET, POST, PUT, DELETE)'),
    page: z.number().optional().default(1).describe('Page number (default 1)'),
    limit: z.number().optional().default(50).describe('Results per page (default 50, max 200)'),
  },
  async ({ version, search, method, page, limit }) => {
    try {
      const data = await callApi('/api/endpoints', { version, search, method, page, limit });
      return success(data);
    } catch (e) {
      return error(`Failed to list endpoints: ${e instanceof Error ? e.message : e}`);
    }
  },
);

server.tool(
  'diff_endpoint',
  'Compare a specific API endpoint between two Rocket.Chat versions. Shows changes in type definitions and implementation code.',
  {
    path: z.string().describe('Endpoint path (e.g. "/v1/channels.create")'),
    method: z.string().optional().default('GET').describe('HTTP method (default "GET")'),
    from: z.string().describe('Source version tag (e.g. "7.13.6")'),
    to: z.string().describe('Target version tag (e.g. "8.3.2")'),
  },
  async ({ path, method, from, to }) => {
    try {
      const data = await callApi('/api/diff/endpoint', { path, method, from, to });
      return success(data);
    } catch (e) {
      return error(`Failed to diff endpoint: ${e instanceof Error ? e.message : e}`);
    }
  },
);

server.tool(
  'diff_file',
  'Get the raw unified diff of a file between two Rocket.Chat versions.',
  {
    path: z.string().describe('File path in the repository (e.g. "apps/meteor/app/api/server/v1/channels.ts")'),
    from: z.string().describe('Source version tag (e.g. "7.13.6")'),
    to: z.string().describe('Target version tag (e.g. "8.3.2")'),
  },
  async ({ path, from, to }) => {
    try {
      const data = await callApi('/api/diff/file', { path, from, to });
      return success(data);
    } catch (e) {
      return error(`Failed to diff file: ${e instanceof Error ? e.message : e}`);
    }
  },
);

server.tool(
  'diff_summary',
  'Get an overview of all API endpoint changes between two Rocket.Chat versions. Shows which endpoints were added, removed, or modified.',
  {
    from: z.string().describe('Source version tag (e.g. "7.13.6")'),
    to: z.string().describe('Target version tag (e.g. "8.3.2")'),
  },
  async ({ from, to }) => {
    try {
      const data = await callApi('/api/diff/summary', { from, to });
      return success(data);
    } catch (e) {
      return error(`Failed to get diff summary: ${e instanceof Error ? e.message : e}`);
    }
  },
);

server.tool(
  'sync_versions',
  'Trigger version discovery and re-indexing. Fetches latest tags from the Rocket.Chat repository and indexes any new versions.',
  {},
  async () => {
    try {
      const data = await callApi('/api/versions/sync', {}, 'POST');
      return success(data);
    } catch (e) {
      return error(`Failed to sync versions: ${e instanceof Error ? e.message : e}`);
    }
  },
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`MCP server connected (API: ${SERVER_URL})`);
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
