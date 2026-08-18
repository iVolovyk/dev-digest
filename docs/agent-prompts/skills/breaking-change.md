---
name: breaking-change
description: Flags removal or narrowing of the public API surface — routes, required inputs, status codes — as a CRITICAL break for an existing caller.
type: security
---

# breaking-change

Treat every change to a route, method, path, or required input as a change an
existing caller has to survive. The caller is not in this diff, cannot be
updated in the same commit, and is deployed against the OLD surface.

**Flag as CRITICAL:**
- A route, HTTP method, or path segment removed or renamed with no alias kept.
- A NEW REQUIRED request field, query param, path segment, or header —
  including a field that became required only because its default was dropped.
- A STATUS CODE change on an existing path: `200 → 201/204`, `422 ⇄ 400`, or a
  not-found flipping between `404` and an empty `200`.
- An auth/scoping requirement added to a route that did not have one before —
  correct to add, but it IS a breaking change and must be reported as one.

**Do NOT flag:**
- A brand-new route or a new OPTIONAL request field with a default — nothing
  that already worked stops working.
- A change to a route that is not reachable outside this service (no exported
  client, no external caller in the stack context).

**For every break, name the migration** in the suggestion: add a route alias,
keep accepting the old field alongside the new one, or version the endpoint.
"This is breaking" with no path forward is half a review.

**Good** (additive, does not break an existing caller):
```diff
 app.get('/repos/:id/pulls', { schema: { params: IdParams } }, handler);
+app.get('/repos/:id/pulls/:number', { schema: { params: PrParams } }, handler);
```

**Bad** (removes a path an existing caller depends on, no alias):
```diff
-app.get('/repos/:id/pulls', { schema: { params: IdParams } }, handler);
+app.get('/repos/:id/prs', { schema: { params: IdParams } }, handler);
```
→ CRITICAL: `GET /repos/:id/pulls` removed and replaced with `/prs`, no alias
kept. Any caller still hitting `/pulls` gets a 404. Suggestion: keep
`/pulls` as an alias that forwards to the new handler for one release, or
version the route (`/v2/repos/:id/prs`).

An intentional, agreed break is still a break. Report it; the author decides.
