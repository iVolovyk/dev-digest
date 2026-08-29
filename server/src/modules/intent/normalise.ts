import {
  MAX_INTENT_STATEMENT_CHARS,
  MAX_RISK_AREAS,
  MAX_RISK_AREA_CHARS,
  MAX_SCOPE_ITEM_CHARS,
  MAX_SCOPE_ITEMS,
} from './constants.js';
import type { IntentExtraction } from './llm-schema.js';

/**
 * Deterministic post-processing of the model's raw extraction (§5b) — the
 * structural analogue of `ConventionsService.verify`. Intent is a summary,
 * not a citation, so it cannot be re-grounded against files; what CAN be
 * enforced mechanically is shape: trim, dedupe, clamp.
 */
export interface NormalisedIntent {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  risk_areas: string[];
}

function clampList(items: string[], maxItems: number, maxChars: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, maxChars));
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Returns `undefined` when the normalised intent statement is empty — the
 * caller treats that identically to a failed model call and degrades to "no
 * intent" rather than persisting an empty row.
 */
export function normaliseIntentExtraction(raw: IntentExtraction): NormalisedIntent | undefined {
  const intent = raw.intent.trim().replace(/\s+/g, ' ').slice(0, MAX_INTENT_STATEMENT_CHARS);
  if (intent.length === 0) return undefined;

  return {
    intent,
    in_scope: clampList(raw.in_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    out_of_scope: clampList(raw.out_of_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    risk_areas: clampList(raw.risk_areas, MAX_RISK_AREAS, MAX_RISK_AREA_CHARS),
  };
}
