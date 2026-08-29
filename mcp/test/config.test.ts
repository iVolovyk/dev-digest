import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies defaults when nothing is set', () => {
    const config = loadConfig({});
    expect(config).toEqual({
      apiBase: 'http://localhost:3001',
      httpTimeoutMs: 30_000,
      runTimeoutMs: 300_000,
      logLevel: 'warn',
    });
  });

  it('coerces numeric env vars and reads the base URL', () => {
    const config = loadConfig({
      DEVDIGEST_API_BASE: 'http://api.internal:9000',
      DEVDIGEST_MCP_RUN_TIMEOUT_MS: '120000',
      DEVDIGEST_MCP_LOG_LEVEL: 'debug',
    });
    expect(config.apiBase).toBe('http://api.internal:9000');
    expect(config.runTimeoutMs).toBe(120_000);
    expect(config.logLevel).toBe('debug');
  });

  it('rejects a non-numeric timeout with a readable message', () => {
    try {
      loadConfig({ DEVDIGEST_MCP_RUN_TIMEOUT_MS: 'soon' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toContain('Invalid DevDigest MCP configuration');
      expect((err as ConfigError).message).toContain('runTimeoutMs');
    }
  });

  it('rejects a negative timeout', () => {
    expect(() => loadConfig({ DEVDIGEST_MCP_HTTP_TIMEOUT_MS: '-5' })).toThrow(ConfigError);
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ DEVDIGEST_MCP_LOG_LEVEL: 'loud' })).toThrow(ConfigError);
  });
});
