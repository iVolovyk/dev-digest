import { z } from 'zod';

/**
 * Runtime configuration. No secrets are involved — the LLM key, GITHUB_TOKEN and
 * all auth stay inside `@devdigest/api` (read from `~/.devdigest/secrets.json` by
 * the server's own SecretsProvider). This package only needs a base URL and two
 * timeouts, so plain env vars with defaults are correct. `~/.devdigest/secrets.json`
 * is deliberately NOT read here.
 */
const ConfigSchema = z.object({
  /** Where `@devdigest/api` listens. */
  apiBase: z.string().min(1).default('http://localhost:3001'),
  /** Per-request HTTP timeout (ms). Generous: some reads make live GitHub round-trips. */
  httpTimeoutMs: z.coerce.number().int().positive().default(30_000),
  /** How long `run_agent_on_pr` waits for a review to finish (ms). */
  runTimeoutMs: z.coerce.number().int().positive().default(300_000),
  /** stderr log verbosity. */
  logLevel: z.enum(['silent', 'warn', 'debug']).default('warn'),
});

export type Config = z.infer<typeof ConfigSchema>;
export type LogLevel = Config['logLevel'];

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Parse `process.env` into a validated {@link Config}. Throws {@link ConfigError}
 * with a human-readable message on failure — `src/index.ts` catches it, writes
 * the message to stderr and exits non-zero *before* the transport opens. A
 * server that starts and then fails every call is worse than one that refuses
 * to start.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    apiBase: env.DEVDIGEST_API_BASE,
    httpTimeoutMs: env.DEVDIGEST_MCP_HTTP_TIMEOUT_MS,
    runTimeoutMs: env.DEVDIGEST_MCP_RUN_TIMEOUT_MS,
    logLevel: env.DEVDIGEST_MCP_LOG_LEVEL,
  });
  if (!parsed.success) {
    throw new ConfigError(
      `Invalid DevDigest MCP configuration:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
