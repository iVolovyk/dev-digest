---
name: deprecation-policy
description: Requires a removal to go through a visible deprecation window (dual-support, a notice, a sunset date) instead of disappearing in one diff.
type: security
---

# deprecation-policy

Removing something a caller depends on is sometimes the right call — but the
removal itself is not the same diff as the announcement. A caller needs to
SEE a field, route, or parameter is going away before it goes away.

**Flag as WARNING when a diff removes or replaces a public route, response
field, or request parameter WITHOUT, in the same diff or a clearly preceding
one:**
- A dual-support window: the old and new shape both work for at least one
  release (old field still populated, old route still routes, old param
  still accepted) — not necessarily forever, but not zero-length either.
- A visible notice at the point of use: a `@deprecated` doc comment on the
  field/route with what to use instead, a `Deprecation`/`Sunset` response
  header, or an explicit CHANGELOG line naming the removal and its timeline.
- A stated sunset: a version, date, or release after which the old shape
  really does disappear — "deprecated" with no end date trains callers to
  ignore the word.

**Escalate to CRITICAL instead of WARNING when the removal has NO
dual-support window at all** — i.e., this diff is simultaneously the
deprecation notice and the removal. That is not a deprecation, it is the
breaking change the `breaking-change` / `response-schema` skills already
flag; call it out here too so the suggestion can be "add the window," not
just "this breaks."

**Do NOT flag:**
- A field/route that was ALREADY marked deprecated with a sunset that has
  passed — removing it on schedule is the policy working, not violating it.
- Removal of something with no external caller (internal-only, never
  exported, same-commit consumer update covers every call site in the repo).

**Good** (dual-support window with a notice and a sunset):
```diff
 export const PrDetail = z.object({
   id: z.string(),
+  /** @deprecated use `headCommit` instead. Removed in v5 (2026-Q2). */
   headSha: z.string(),
+  headCommit: z.string(),
 });
```

**Bad** (same rename, no window — this diff IS the removal):
```diff
 export const PrDetail = z.object({
   id: z.string(),
-  headSha: z.string(),
+  headCommit: z.string(),
 });
```
→ WARNING (escalate to CRITICAL if nothing upstream already deprecated
`headSha`): `headSha` disappears in the same diff that introduces
`headCommit`, with no prior notice and no window for callers to migrate.
Suggestion: reintroduce `headSha` alongside `headCommit` for one release,
mark it `@deprecated` with a sunset date, then remove it in a follow-up diff.
