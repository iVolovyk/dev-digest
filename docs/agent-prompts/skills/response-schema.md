---
name: response-schema
description: Flags removed/renamed response fields, narrowed types, and silent meaning changes in a response shape as CRITICAL.
type: security
---

# response-schema

A response shape is a contract a caller parses by field name and type.
Clients read fields they expect to exist and to have a stable meaning — this
skill is about what happens to THEM when the shape underneath changes.

**Flag as CRITICAL:**
- A response field REMOVED or RENAMED. A rename is a removal plus an
  addition — the old field's readers get `undefined`, silently.
- A type NARROWED: `string` → an enum, `nullable` → `non-nullable`, a wide
  number range → a bounded one, an array → a single value.
- A field whose declared TYPE is unchanged but whose MEANING, unit, timezone,
  or encoding changed (seconds → milliseconds, local time → UTC, an id →
  a slug). This is the most damaging case: nothing fails to compile, and
  every caller silently misreads the value from then on.
- An optional/nullable response field becoming required/non-nullable — a
  producer that used to omit it now has to always supply it, and a consumer
  that checked for absence stops seeing that branch exercised.

**Do NOT flag:**
- A new OPTIONAL response field. Existing readers ignore fields they don't
  know about — this is backwards compatible by construction.
- A required → optional/nullable widening on a response field (strictly
  loosens what a caller must handle).
- Internal/private types never serialized onto the wire.

**Good** (additive, existing readers unaffected):
```diff
 export const PrDetail = z.object({
   id: z.string(),
   title: z.string(),
+  reviewers: z.array(z.string()).optional(),
 });
```

**Bad** (rename presented as if it were the same field):
```diff
 export const PrDetail = z.object({
   id: z.string(),
-  headSha: z.string(),
+  headCommit: z.string(),
 });
```
→ CRITICAL: `headSha` removed, `headCommit` added. Any client reading
`pr.headSha` now gets `undefined` instead of a type error, because the field
is simply missing from the payload — nothing in a dynamically-typed consumer
catches this at build time. Suggestion: emit both `headSha` and
`headCommit` for one release, or version the endpoint.

Cite the exact field, its old type/meaning and its new one — "the response
shape changed" without naming the field is not a usable finding.
