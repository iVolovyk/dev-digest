import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiError,
  ApiShapeError,
  ApiTimeoutError,
  ApiUnreachableError,
  createApiClient,
} from '../src/api/client.js';
import { fakeFetch } from './helpers.js';

const Schema = z.object({ ok: z.boolean() });

function client(fetch: typeof globalThis.fetch) {
  return createApiClient({ baseUrl: 'http://localhost:3001', timeoutMs: 1_000, fetch });
}

describe('createApiClient', () => {
  it('parses a structured ApiErrorBody into ApiError (message + code + status)', async () => {
    const { fetch } = fakeFetch({
      'GET /x': { status: 422, json: { error: { code: 'bad_input', message: 'nope' } } },
    });
    await expect(client(fetch).get('/x', Schema)).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'bad_input',
      message: 'nope',
    });
  });

  it('survives a non-JSON error body', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { status: 500, text: '<html>502</html>' } });
    const err = await client(fetch)
      .get('/x', Schema)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });

  it('distinguishes 429', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { status: 429, json: { error: { code: 'rate', message: 'slow down' } } } });
    const err = await client(fetch)
      .get('/x', Schema)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
  });

  it('maps a connection failure to the exact "start it first" message', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { throw: 'TypeError' } });
    const err = await client(fetch)
      .get('/x', Schema)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect(err.message).toBe(
      'Cannot reach the DevDigest API at http://localhost:3001. Start it first: ./scripts/dev.sh ' +
        '(or: cd server && pnpm dev). It must be running before any devdigest tool works.',
    );
  });

  it('maps a timeout abort to ApiTimeoutError', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { throw: 'TimeoutError' } });
    await expect(client(fetch).get('/x', Schema)).rejects.toBeInstanceOf(ApiTimeoutError);
  });

  it('raises ApiShapeError naming the endpoint when the body does not match', async () => {
    const { fetch } = fakeFetch({ 'GET /x': { json: { ok: 'yes' } } });
    const err = await client(fetch)
      .get('/x', Schema)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiShapeError);
    expect(err.message).toContain('/x');
  });

  it('sends a JSON content-type only when a body is present', async () => {
    const { fetch, calls } = fakeFetch({
      'GET /x': { json: { ok: true } },
      'POST /y': { json: { ok: true } },
    });
    const c = client(fetch);
    await c.get('/x', Schema);
    await c.post('/y', { a: 1 }, Schema);
    expect(calls[1]?.body).toEqual({ a: 1 });
  });
});
