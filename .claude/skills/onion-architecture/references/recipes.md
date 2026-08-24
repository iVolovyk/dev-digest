# Recipes

Four walkthroughs, in the order the files should be created. Working directory
is `server/` unless stated. Run `pnpm arch && pnpm typecheck` at the end of each.

---

## 1. A new endpoint on an existing module

Example: `GET /repos/:id/stats`.

1. **Contract** — `src/vendor/shared/contracts/<domain>.ts`
   ```ts
   export const RepoStats = z.object({
     pulls: z.number().int(), reviews: z.number().int(), openFindings: z.number().int(),
   });
   export type RepoStats = z.infer<typeof RepoStats>;
   ```
   One definition drives request validation *and* response serialization.

2. **Repository** — `src/modules/repos/repository.ts`
   ```ts
   countsForRepo(workspaceId: string, repoId: string): Promise<RepoStats> {
     // drizzle lives here and nowhere above
   }
   ```
   Return the contract type, not `$inferSelect` rows. Scope by `workspaceId` —
   every domain table carries it.

3. **Service** — `src/modules/repos/service.ts`
   ```ts
   async stats(workspaceId: string, repoId: string): Promise<RepoStats> {
     const repo = await this.repo.getById(workspaceId, repoId);
     if (!repo) throw new NotFoundError('Repo not found');
     return this.repo.countsForRepo(workspaceId, repoId);
   }
   ```
   If the method would be a one-line forward with no rule in it, that is a sign
   the endpoint is pure CRUD — keep the forward anyway so `routes.ts` never
   learns the repository exists.

4. **Route** — `src/modules/repos/routes.ts`
   ```ts
   app.get('/repos/:id/stats', { schema: { params: IdParams, response: { 200: RepoStats } } },
     async (req) => {
       const { workspaceId } = await getContext(container, req);
       return service.stats(workspaceId, req.params.id);
     });
   ```
   Add a tighter `config.rateLimit` if the endpoint is expensive (the review
   trigger uses `{ max: 10, timeWindow: '1 minute' }`).

5. **Test** — `test/<module>.it.test.ts` if it needs Postgres, otherwise
   `test/<module>.test.ts` with mocks. The `.it.` suffix drives the CI split.

---

## 2. A new external integration

Example: a Jira client.

1. **Port** — `src/vendor/shared/adapters.ts`, next to `GitHubClient`:
   ```ts
   export interface JiraClient {
     getIssue(key: string): Promise<JiraIssue | null>;
   }
   ```
   Name the capability, not the vendor. Keep the surface to what a caller
   actually needs — a port is not a wrapper around the whole SDK.

2. **Mock** — `src/adapters/mocks.ts`, in the *same commit*. Without it the
   service is untestable and the next person will inject the real client.

3. **Implementation** — `src/adapters/jira/client.ts`, class `JiraHttpClient
   implements JiraClient`. It may import its SDK; it must not import a module
   or the container.

4. **Container** — `src/platform/container.ts`: a lazy getter plus a
   `ContainerOverrides` entry, mirroring `git` / `codeIndex`:
   ```ts
   jira?: JiraClient;               // in ContainerOverrides
   get jira(): JiraClient {
     if (this.overrides.jira) return this.overrides.jira;
     return (this._jira ??= new JiraHttpClient(...));
   }
   ```
   If it needs a key, resolve it through `this.secrets.get(...)` and make the
   getter `async`, like `github()` — and throw `ConfigError`, never crash boot.
   Secrets live in `~/.devdigest/secrets.json`, never in `AppConfig`.

5. **Inject** — `routes.ts` constructs the service with `container.jira`. The
   service's constructor names `JiraClient`, never `Container`.

---

## 3. A new table

1. `src/db/schema/<domain>.ts` — add the table; `src/db/schema.ts` re-exports
   the domain files, so a new file needs one `export *` line.
   Every domain table carries `workspace_id`.
2. `pnpm db:generate` — Drizzle writes a **new** migration. Never edit an
   already-applied `src/db/migrations/*.sql`: it desyncs the checksum/snapshot
   for anyone who has run it.
3. `pnpm db:migrate` — migrations are **not** applied on boot.
4. Repository method + contract type, per recipe 1. The Drizzle row type does
   not leave `repository*`.

Check whether the table already exists first: the schema already contains every
table the course needs, and unused ones sit empty until a lesson fills them.

---

## 4. A new module

```
src/modules/<name>/
  routes.ts        default-export Fastify plugin — the module's composition root
  service.ts       orchestration
  repository.ts    SQL (create it even if it starts with two methods)
  helpers.ts       pure functions, row → DTO
  constants.ts     module-local magic values
```

Register it with one import + one entry in `src/modules/index.ts`. Registration
is static on purpose — dynamic `import()` of `.ts` is not portable across tsx,
the bundler, and vitest.

The plugin body, in order: `withTypeProvider<ZodTypeProvider>()` → read
`app.container` → construct the service → declare routes. Plugins (helmet,
cors, rate-limit, SSE, the error handler) are registered before modules, so an
encapsulated module plugin inherits them.

Do not import another module. If you need its data, put the repository on the
container (as `agentsRepo` / `reviewRepo` already are) and inject it.
