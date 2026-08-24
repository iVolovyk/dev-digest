/** Constants for the conventions module. */

/** How many repoIntel-ranked source files to sample, on top of config files. */
export const SAMPLE_FILE_COUNT = 12;

/** Config filenames checked for existence and sampled alongside ranked source files. */
export const CONFIG_FILE_CANDIDATES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
] as const;

/** Feature id this module resolves its provider/model through (settings > feature models). */
export const CONVENTIONS_FEATURE_ID = 'conventions' as const;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtractionResult';

export const EXTRACTION_MAX_RETRIES = 2;
