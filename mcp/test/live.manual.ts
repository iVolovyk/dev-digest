/**
 * MANUAL live check — NOT a vitest file (filename is `.manual.ts`, so
 * `pnpm test` never picks it up). Run with `pnpm test:live` against a running
 * DevDigest API. This is the only thing that catches API-shape drift: the
 * hermetic suite validates the shape we expect; this validates the shape the
 * API actually sends.
 *
 * Precondition: `./scripts/dev.sh` (or `docker compose up -d && cd server &&
 * pnpm db:migrate && pnpm db:seed && pnpm dev`). At least one repo with an
 * imported PR must exist (the seed provides `acme/payments-api`).
 *
 * Env overrides: DEVDIGEST_API_BASE, LIVE_REPO, LIVE_PR, LIVE_AGENT.
 */
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createApiClient } from '../src/api/client.js';
import { createResolver } from '../src/api/resolve.js';
import { buildRegistry } from '../src/tools/registry.js';
import type { ToolDef } from '../src/tools/shared.js';

const REPO = process.env.LIVE_REPO ?? 'acme/payments-api';
const PR = Number(process.env.LIVE_PR ?? '7');
const AGENT = process.env.LIVE_AGENT ?? 'Security Reviewer';

function log(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

async function callAndValidate(
  tool: ToolDef,
  args: Record<string, unknown>,
): Promise<void> {
  log(`\n── ${tool.name} ${JSON.stringify(args)}`);
  const result = await tool.handler(args);
  const text = result.content[0];
  if (text && text.type === 'text') log(text.text.slice(0, 800));
  if (result.isError) {
    log(`   (isError: true)`);
    return;
  }
  const parsed = tool.outputSchema.safeParse(result.structuredContent);
  if (!parsed.success) {
    log(`   ✗ outputSchema MISMATCH — the API shape has drifted:`);
    log(`     ${JSON.stringify(parsed.error.issues, null, 2)}`);
    process.exitCode = 1;
  } else {
    log(`   ✓ conforms to outputSchema`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const client = createApiClient({ baseUrl: config.apiBase, timeoutMs: config.httpTimeoutMs });
  const resolver = createResolver(client);
  const tools = buildRegistry({ client, resolver, config, logger });
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  // 1. health
  try {
    const res = await fetch(`${config.apiBase}/health`);
    if (!res.ok) throw new Error(String(res.status));
    log(`API health OK at ${config.apiBase}`);
  } catch {
    log(
      `Cannot reach the DevDigest API at ${config.apiBase}. Start it first: ./scripts/dev.sh ` +
        `(or: cd server && pnpm dev). It must be running before any devdigest tool works.`,
    );
    process.exit(1);
  }

  // 2. read-only + free
  await callAndValidate(byName.list_agents!, {});
  await callAndValidate(byName.get_conventions!, { repo: REPO });
  await callAndValidate(byName.get_blast_radius!, { repo: REPO, pr: PR });
  await callAndValidate(byName.get_findings!, { repo: REPO, pr: PR });

  // 3. costs money — prompt first
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(
    `\nRun run_agent_on_pr("${REPO}", ${PR}, "${AGENT}")? This costs an LLM call. [y/N] `,
  );
  rl.close();
  if (answer.trim().toLowerCase() === 'y') {
    await callAndValidate(byName.run_agent_on_pr!, { repo: REPO, pr: PR, agent: AGENT });
  } else {
    log('skipped run_agent_on_pr');
  }
}

void main();
