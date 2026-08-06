# e2e (@devdigest/e2e)

Deterministic browser e2e for the web app. Full picture → README.md (flow
anatomy, coverage table).

## Stack specifics
Driven by Vercel **agent-browser** (Rust + CDP) — no Playwright, no LLM, no API
key. A flow is a JSON list of agent-browser commands (`specs/NN-name.flow.json`)
run in order against one shared browser session by `run.ts`.

## Run
- **Hermetic (recommended):** `./scripts/e2e.sh` — isolated Postgres/API/web on
  alternate ports (5433/3101/3100), freshly seeded every run, torn down after.
- **Against your own stack:** `cd e2e && npm test` — only safe if your dev DB
  contains *only* the seeded demo repo (`acme/payments-api`); otherwise flows
  02/04/05 land on the wrong repo and fail.

## Non-default conventions
- `specs/*.flow.json` here are **executable** — consumed directly by `run.ts`,
  not free-text docs. `"wait --text"` / `"wait --url"` steps double as the
  assertions (they exit non-zero on timeout).
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`);
  the AI `chat` command is never used, so runs stay stable and key-free.

## Gotchas
- **Never `docker compose down -v`** to "reset" your dev DB — it deletes the
  `devdigest_pgdata` volume along with every real repo/review you've imported.
  Use the hermetic runner instead of touching your dev stack.

## Do not touch
- `test-results/` — git-ignored failure screenshots.

## Read when
- `README.md` — read when you need the flow-file anatomy or the coverage table.
- `specs/*.flow.json` — read/edit when adding or changing a UI-flow assertion.
- `docs/` — read when you need the rationale behind a decision here.
- `INSIGHTS.md` — read via the `engineering-insights` skill before debugging
  something that feels familiar; the skill appends to it at the end of a
  non-trivial task.
