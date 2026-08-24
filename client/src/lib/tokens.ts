/* tokens.ts — client-side token *estimation* for display only.

   The real counts come from the server, which tokenizes with js-tiktoken and
   persists the numbers on the run (RunStats.tokens_in / tokens_out,
   SkillStats.body_tokens). Never use these helpers for billing, budget
   enforcement, or anything that must agree with the model — they exist so the
   UI can answer "roughly how much does this block cost?" without a round-trip,
   and every string they produce is prefixed with "~" for that reason. */

/** Characters per token in the ~4:1 English/Markdown heuristic. */
const CHARS_PER_TOKEN = 4;

/**
 * Approximate token count of `text` (≈ 1 token per 4 characters).
 *
 * Display-only heuristic — exact counts come from the server (js-tiktoken).
 * Real tokenizers split on sub-words, so this over-counts dense prose and
 * under-counts code/CJK; expect ±20% against the tokenizer.
 */
export function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Sum of `approxTokens` over several blocks (skill bodies, prompt segments). */
export function approxTokensOf(texts: readonly string[]): number {
  return texts.reduce((n, text) => n + approxTokens(text), 0);
}

/**
 * Thousands-separated token count for interpolation into an i18n string that
 * already carries the "~" (e.g. `trace.prompt.tokens` = "~{n} tokens").
 */
export function formatApproxTokens(text: string): string {
  return approxTokens(text).toLocaleString();
}
