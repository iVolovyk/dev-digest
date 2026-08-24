# Placement rules — I have X, where does it go?

All paths relative to `server/` unless stated otherwise.

## By artefact

| I have | It goes in | Promote / move when |
|---|---|---|
| A call to an HTTP API, git, an LLM, the shell | interface in `src/vendor/shared/adapters.ts`, impl in `src/adapters/<name>/`, mock in `src/adapters/mocks.ts` | never — it is already at the edge |
| A SQL query | `src/modules/<m>/repository.ts`; split by aggregate into `repository/<agg>.repo.ts` once the file passes ~300 lines (see `modules/reviews/repository/`) | — |
| Orchestration across a repository + a port | `src/modules/<m>/service.ts` | it grows past ~400 lines → extract a collaborator (`run-executor.ts`, `pipeline/`), not a second service |
| A rule that holds without HTTP and without Postgres, needed by the reviewer | `reviewer-core/src/` | — |
| The same rule, needed by one module only | a pure function in `src/modules/<m>/helpers.ts` | a second module needs it → `modules/_shared/` |
| A Zod shape crossing a package boundary (API request/response, run event, finding) | `src/vendor/shared/contracts/<domain>.ts` | — |
| A Zod shape used only inside one module's routes | `src/modules/<m>/routes.ts`, or `modules/_shared/schemas.ts` if it is a generic param shape like `IdParams` | — |
| An HTTP concern: status code, header, SSE framing, rate-limit config | `src/modules/<m>/routes.ts` | — |
| Tenancy resolution | already exists — `getContext(container, req)` in `modules/_shared/context.ts`. Call it, do not reimplement | — |
| A decision about *which* implementation to use | `src/platform/container.ts` (a lazy getter, mirroring `git` / `codeIndex` / `repoIntel`) | — |
| A cross-cutting mechanism (job runner, SSE bus, error types, resilience, config) | `src/platform/` | — |
| A new table | `src/db/schema/<domain>.ts`, re-exported by `src/db/schema.ts` | — |
| A magic number or string used by one module | `src/modules/<m>/constants.ts` | a second module needs it → `_shared/` or the contracts |
| A row → DTO mapper | `src/modules/<m>/helpers.ts`, called from the repository or the service — never from `routes.ts` | — |
| A test that touches Postgres | `test/*.it.test.ts` — the suffix is load-bearing, it drives the CI split | — |
| A test with no DB | `test/*.test.ts` with adapters mocked from `src/adapters/mocks.ts` | — |

## The distinction that decides most files

| Bucket | Knows the domain | Touches the outside world | Folder |
|---|:--:|:--:|---|
| contracts | yes | no | `vendor/shared/contracts/` |
| core logic | yes | no | `reviewer-core/src/`, module `helpers.ts` |
| service | yes | through ports | `modules/<m>/service.ts` |
| repository | yes | yes (SQL) | `modules/<m>/repository*` |
| adapter | no | yes | `adapters/<name>/` |
| platform | no | sometimes | `platform/` |

A file in `helpers.ts` that imports `drizzle-orm` is misfiled — it is a
repository. A file in `adapters/` that imports a feature module's constants is
misfiled — that constant belongs in the port contract or in the constructor.

## Naming

- Folders: `modules/<kebab-name>/`, `adapters/<kebab-name>/`.
- Fixed filenames inside a module: `routes.ts`, `service.ts`, `repository.ts`,
  `helpers.ts`, `constants.ts`, `types.ts`. The gate keys off `routes.ts` and
  `repository*` — renaming them silently disables rules.
- Adapters are named after the technology (`octokit.ts`, `simple-git.ts`,
  `ripgrep.ts`), classes after the role (`OctokitGitHubClient`,
  `SimpleGitClient`, `RipgrepCodeIndex`): `<Tech><Port>`.
- Ports are named after the capability, not the vendor: `GitHubClient`, not
  `OctokitClient`.

## Order within a file

Imports → types → constants → the class or plugin → exported helpers.
`routes.ts` puts the service construction at the top of the plugin body, before
the first `app.<verb>` call, so the composition root of the module is visible in
one glance.
