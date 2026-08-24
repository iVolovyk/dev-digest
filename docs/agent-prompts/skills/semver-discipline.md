---
name: semver-discipline
description: Checks that a change to the API surface carries a version signal matching its impact — breaking changes need a major bump, not a silent patch.
type: security
---

# semver-discipline

A version number (package version, CHANGELOG entry, or an explicit API
version segment/header) is a promise to callers about what kind of change
just shipped. This skill checks that the promise matches the diff, not that
a version bump merely exists.

**Map the change to the bump it requires:**
- **Major** — anything reachable by an external caller that stops working
  or starts meaning something different: a removed/renamed route or response
  field, a narrowed type, a new required input, a changed status code, or a
  same-type-different-meaning field (see `breaking-change` / `response-schema`
  for the full catalog). No exceptions for "small" breaks — size doesn't
  change the bump, reachability does.
- **Minor** — purely additive and backwards compatible: a new optional
  field, a new route, a new enum value on an OUTPUT the caller can still
  treat as "some string I don't recognize."
- **Patch** — internal fix with no observable shape or behavior change from
  a caller's point of view: bug fixes, performance, refactors.

**Flag as WARNING:**
- A diff matches the Major criteria above but ships without a version bump
  (`package.json`), a CHANGELOG entry marked breaking, or an explicit
  `/v{n}/` path or version header change on the affected endpoint.
- A version bump labeled "patch" or "minor" (in the CHANGELOG, or the
  package version's bump level) that actually contains a Major-class change
  per the criteria above — the label undersells the risk to whoever reads it
  before upgrading.

**Do NOT flag:**
- A Major-class change that DOES carry a matching version signal — that is
  the system working as intended, not a finding.
- Version-bump hygiene on code with no reachable API surface at all (internal
  tooling, test helpers).

**Good** (breaking change, version signal matches):
```diff
-app.get('/repos/:id/pulls/:number', handler);   // returns headSha
+app.get('/v2/repos/:id/pulls/:number', handler); // returns headCommit
```
```diff
-  "version": "3.4.0",
+  "version": "4.0.0",
```
→ Major bump + a versioned route accompany the breaking rename. Nothing to flag.

**Bad** (same break, no signal):
```diff
-app.get('/repos/:id/pulls/:number', handler);   // returns headSha
+app.get('/repos/:id/pulls/:number', handler);   // returns headCommit
```
```diff
-  "version": "3.4.0",
+  "version": "3.4.1",
```
→ WARNING: the response field rename is a Major-class break (see
`response-schema`), but the version only bumped patch and the route path is
unchanged — nothing signals to an integrator that this release needs review
before upgrading. Suggestion: bump major, or land the rename behind a new
route/version instead.
