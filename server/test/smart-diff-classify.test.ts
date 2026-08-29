import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/smart-diff/classify.js';
import { BOILERPLATE_LOCKFILES } from '../src/modules/smart-diff/constants.js';

/**
 * The classifier is pure and path-only. These tables ARE the proof of the two
 * load-bearing acceptance criteria: "lock file is ALWAYS boilerplate,
 * unconditionally" and "core is the fail-toward-attention default".
 */
describe('classifyFile — boilerplate: lock files (unconditional)', () => {
  const depths = ['', 'server/', 'a/b/c/', 'packages/web/nested/deep/'];
  for (const lock of BOILERPLATE_LOCKFILES) {
    for (const prefix of depths) {
      it(`${prefix}${lock} → boilerplate`, () => {
        expect(classifyFile(`${prefix}${lock}`)).toBe('boilerplate');
      });
    }
  }

  it('a lock file is boilerplate regardless of how small the diff is', () => {
    // (size is not an input to classifyFile at all — this documents intent)
    expect(classifyFile('pnpm-lock.yaml')).toBe('boilerplate');
  });
});

describe('classifyFile — boilerplate: generated dirs / extensions / filenames', () => {
  it.each([
    ['dist/index.js', 'boilerplate — beats the wiring index.* rule (order)'],
    ['server/dist/app.js', 'nested dist'],
    ['coverage/lcov-report/index.html', 'coverage tree'],
    ['client/src/vendor/ui/Button.tsx', 'vendored tree'],
    ['server/src/db/migrations/meta/_journal.json', 'migration metadata'],
    ['src/api/types.generated.ts', '*.generated.*'],
    ['src/proto/user.pb.go', '*.pb.go'],
    ['src/lib/api.d.ts', '*.d.ts'],
    ['bundle.min.js', '.min.js'],
    ['__snapshots__/App.test.tsx.snap', 'snapshot'],
  ])('%s → boilerplate (%s)', (path) => {
    expect(classifyFile(path)).toBe('boilerplate');
  });

  it('package.json → boilerplate (Open Question 1, resolved: match the mockup)', () => {
    expect(classifyFile('package.json')).toBe('boilerplate');
    expect(classifyFile('server/package.json')).toBe('boilerplate');
  });
});

describe('classifyFile — wiring: repo-specific judgement', () => {
  it.each([
    'src/modules/pulls/routes.ts',
    'src/modules/index.ts',
    'src/platform/container.ts',
    'client/next.config.mjs',
    'vitest.config.ts',
    'tsconfig.json',
    'tsconfig.build.json',
    '.eslintrc.cjs',
    'Dockerfile',
    'docker-compose.yml',
    '.github/workflows/ci.yml',
  ])('%s → wiring', (path) => {
    expect(classifyFile(path)).toBe('wiring');
  });
});

describe('classifyFile — core: the fallback (fail-toward-attention)', () => {
  it.each([
    'src/lib/checkout.ts',
    'server/src/modules/smart-diff/service.ts',
    'weird.xyz',
    'README.md',
    'docs/architecture.md',
  ])('%s → core', (path) => {
    expect(classifyFile(path)).toBe('core');
  });
});
