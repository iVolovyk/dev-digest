import type { LogLevel } from './config.js';

/**
 * A tiny leveled writer over `process.stderr`.
 *
 * stdio gotcha: in a stdio MCP server **stdout is the JSON-RPC wire**. A single
 * `console.log` / `process.stdout.write` corrupts the stream and the client
 * reports an opaque parse failure. Everything logged goes to stderr, always.
 *
 * security A09: never pass a full API response body here — messages only.
 */
export interface Logger {
  warn(message: string, detail?: string): void;
  debug(message: string, detail?: string): void;
}

const RANK: Record<LogLevel, number> = { silent: 0, warn: 1, debug: 2 };

export function createLogger(level: LogLevel): Logger {
  const emit = (lvl: 'warn' | 'debug', message: string, detail?: string): void => {
    if (RANK[level] < RANK[lvl]) return;
    const line = detail ? `${message} ${detail}` : message;
    process.stderr.write(`[devdigest-mcp] ${lvl}: ${line}\n`);
  };
  return {
    warn: (message, detail) => emit('warn', message, detail),
    debug: (message, detail) => emit('debug', message, detail),
  };
}
