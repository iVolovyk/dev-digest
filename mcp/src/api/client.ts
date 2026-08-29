import type { z } from 'zod';

/**
 * Thin HTTP client for `@devdigest/api`. Modelled on `client/src/lib/api.ts`,
 * with one structural change: `fetch` is injected, so hermetic tests need no
 * global monkey-patching.
 *
 * security A05: callers pass fully-built paths; every interpolated segment must
 * already be `encodeURIComponent`-ed by the caller. In practice the only values
 * reaching a URL here are UUIDs produced by resolution (`resolve.ts`), never raw
 * model input.
 * security A09: response bodies are never logged.
 * security A10: an unreachable API becomes a loud error, never an empty success.
 */

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** The API returned a body that does not match the shape we forward. Drift detector. */
export class ApiShapeError extends Error {
  override name = 'ApiShapeError';
  constructor(
    readonly endpoint: string,
    readonly detail: string,
  ) {
    super(`Unexpected response shape from ${endpoint}: ${detail}`);
  }
}

/** `fetch` rejected before an HTTP status — almost always the API is not running. */
export class ApiUnreachableError extends Error {
  override name = 'ApiUnreachableError';
}

/** The request exceeded the configured per-request timeout. */
export class ApiTimeoutError extends Error {
  override name = 'ApiTimeoutError';
}

export interface ApiClient {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
}

export interface CreateApiClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** DI seam for tests. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
}

interface ApiErrorBodyShape {
  error?: { code?: unknown; message?: unknown; details?: unknown };
}

export function createApiClient(opts: CreateApiClientOptions): ApiClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const base = opts.baseUrl.replace(/\/+$/, '');

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const url = `${base}${path}`;
    const hasBody = method === 'POST';

    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        // Declare a JSON content-type ONLY when a body is actually sent —
        // a body-less POST otherwise trips Fastify's "Body cannot be empty
        // when content-type is application/json" (client/src/lib/api.ts:26-30).
        headers: hasBody ? { 'content-type': 'application/json' } : {},
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ApiTimeoutError(
          `The DevDigest API at ${base} did not respond within ${opts.timeoutMs}ms.`,
        );
      }
      throw new ApiUnreachableError(
        `Cannot reach the DevDigest API at ${base}. Start it first: ./scripts/dev.sh ` +
          `(or: cd server && pnpm dev). It must be running before any devdigest tool works.`,
      );
    }

    if (!res.ok) {
      let code: string | undefined;
      let message = `${res.status} ${res.statusText}`;
      try {
        const parsed = (await res.json()) as ApiErrorBodyShape;
        if (parsed && typeof parsed.error === 'object' && parsed.error) {
          if (typeof parsed.error.code === 'string') code = parsed.error.code;
          if (typeof parsed.error.message === 'string') message = parsed.error.message;
        }
      } catch {
        /* non-JSON error body — keep the status line. `details` is never surfaced. */
      }
      throw new ApiError(message, res.status, code);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiShapeError(path, 'response body was not valid JSON');
    }

    const result = schema.safeParse(json);
    if (!result.success) {
      throw new ApiShapeError(path, result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return result.data;
  }

  return {
    get: (path, schema) => request('GET', path, undefined, schema),
    post: (path, body, schema) => request('POST', path, body, schema),
  };
}

/** Encode a single path segment. Use for every interpolation into an API path. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}
