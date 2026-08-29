import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { ToolCallback } from '@modelcontextprotocol/server';
import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createApiClient } from './api/client.js';
import { createResolver } from './api/resolve.js';
import { buildRegistry } from './tools/registry.js';

/**
 * Composition root: config → client → resolver → register 5 tools → serveStdio.
 * The ONLY file that calls `serveStdio` and the only file that constructs the
 * API client (onion §"Architectural constraints": dependencies point inward).
 *
 * ALL logging goes to stderr — stdout is the JSON-RPC wire.
 */

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const config = (() => {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) fail(err.message);
    throw err;
  }
})();

const logger = createLogger(config.logLevel);
const client = createApiClient({ baseUrl: config.apiBase, timeoutMs: config.httpTimeoutMs });
const resolver = createResolver(client);
const tools = buildRegistry({ client, resolver, config, logger });

logger.debug(`starting devdigest MCP server against ${config.apiBase}`);

serveStdio(() => {
  const server = new McpServer(
    { name: 'devdigest', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      },
      ((args: Record<string, unknown>) => tool.handler(args)) as ToolCallback<typeof tool.inputSchema>,
    );
  }
  return server;
});

process.on('uncaughtException', (err) => {
  logger.warn('uncaught exception — exiting', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.warn('unhandled rejection — exiting', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
