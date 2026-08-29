import { expect } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { createApiClient } from '../src/api/client.js';
import { createResolver } from '../src/api/resolve.js';
import type { ToolDeps } from '../src/tools/shared.js';

export interface FakeResponse {
  status?: number;
  json?: unknown;
  /** Non-JSON body — when set, `.json()` rejects. */
  text?: string;
  /** Throw instead of responding (network failure). Value becomes `err.name`. */
  throw?: 'TypeError' | 'TimeoutError' | 'AbortError';
}

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

const BASE = 'http://localhost:3001';

/**
 * A `fetch` stand-in driven by a route table. A value may be a single response
 * or an array consumed one-per-call (the last entry repeats once exhausted).
 * Keys are `"<METHOD> <path>"`, e.g. `"GET /repos"`.
 */
export function fakeFetch(routes: Record<string, FakeResponse | FakeResponse[]>): {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const cursors = new Map<string, number>();

  const fetch = (async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.replace(BASE, '').replace(/\?.*$/, '');
    const body = init?.body != null ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });

    const key = `${method} ${path}`;
    const entry = routes[key];
    if (entry === undefined) {
      throw Object.assign(new Error(`unrouted ${key}`), { name: 'TypeError' });
    }
    let resp: FakeResponse;
    if (Array.isArray(entry)) {
      const i = cursors.get(key) ?? 0;
      resp = entry[Math.min(i, entry.length - 1)]!;
      cursors.set(key, i + 1);
    } else {
      resp = entry;
    }

    if (resp.throw) {
      throw Object.assign(new Error(resp.throw), { name: resp.throw });
    }

    const status = resp.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => {
        if (resp.text !== undefined) throw new Error('not json');
        return resp.json;
      },
    } as Response;
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

export interface MakeDepsOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  runTimeoutMs?: number;
}

/** Wire real client + resolver over a fake fetch. */
export function makeDeps(
  fetch: typeof globalThis.fetch,
  opts: MakeDepsOptions = {},
): ToolDeps {
  const client = createApiClient({ baseUrl: BASE, timeoutMs: 1_000, fetch });
  const now = opts.now ?? (() => 0);
  const resolver = createResolver(client, { now });
  return {
    client,
    resolver,
    config: {
      apiBase: BASE,
      httpTimeoutMs: 1_000,
      runTimeoutMs: opts.runTimeoutMs ?? 300_000,
      logLevel: 'silent',
    },
    logger: { warn: () => {}, debug: () => {} },
    now,
    sleep: opts.sleep ?? (async () => {}),
  };
}

export function structured(result: CallToolResult): Record<string, unknown> {
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

export function textOf(result: CallToolResult): string {
  const first = result.content?.[0];
  return first && first.type === 'text' ? first.text : '';
}

export function expectToolError(result: CallToolResult): string {
  expect(result.isError).toBe(true);
  return textOf(result);
}
