# reviewer-core (@devdigest/reviewer-core)

Pure review engine: diff → prompt → LLM → grounded findings. Full picture →
README.md (pipeline diagram).

## Stack specifics
No database, GitHub, or filesystem access — the only side effect is an
injected `LLMProvider`, which is what makes the engine mock-testable. The
package never emits JS; its `build` is a type-check. The server consumes it
directly via a tsconfig path alias, not a published module.

## Test
`npm test` (vitest) — hermetic units with a stubbed `LLMProvider`: prompt
assembly, the grounding gate, `toReview` selection, a full `run`. No keys, no
network. `npm run typecheck` doubles as the build.

## Non-default conventions
- Accepts optional prompt slots (`skills`, `memory`, `specs`, `callers`) that
  later course lessons feed in; the starter server passes only diff + system
  prompt + repo map, so `assemblePrompt` simply omits the rest — that's expected,
  not a bug.

## Gotchas
- **Grounding is mandatory.** A finding that doesn't cite a real line in the
  diff is dropped (`groundFindings`); the score is recomputed from the
  surviving findings, never trusted from the model's self-report.
- **Prompt-injection defense is one shared rule, not text parsing.** The
  `INJECTION_GUARD` appended by `assemblePrompt` tells the model untrusted
  content (diff/README/comments) is data, never instructions — don't try to
  "improve" this with keyword denylists.

## Read when
- `README.md` — read when you need the full pipeline diagram or public API list.
- `docs/` — read when you need the rationale behind a decision here.
- `specs/` — read when implementing a feature that has a written spec (this is
  also the slot L05's Project Context Folder eventually feeds into the prompt).
- `INSIGHTS.md` — read via the `engineering-insights` skill before debugging
  something that feels familiar; the skill appends to it at the end of a
  non-trivial task.
