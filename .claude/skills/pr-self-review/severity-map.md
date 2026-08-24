# Severity normalization

The app's canonical scale — `Severity` in
`server/src/vendor/shared/contracts/findings.ts` — is
`CRITICAL | WARNING | SUGGESTION`. Every finding from every matched skill
gets mapped into this scale before it's reported or written to the gate
artifact. A CRITICAL finding from **any** matched skill is what trips the
`PreToolUse` hook.

| Source skill | Native scale | → CRITICAL | → WARNING | → SUGGESTION |
|---|---|---|---|---|
| `security` | CRITICAL / HIGH / MEDIUM / LOW confidence (LOW is never reported — see the skill's own "Confidence-Based Review" section) | CRITICAL | HIGH | MEDIUM |
| `react-best-practices` | CRITICAL / HIGH / MEDIUM (skill explicitly tags rules "for use by consuming agents") | CRITICAL | HIGH | MEDIUM |
| `onion-architecture` | dependency-cruiser `error` / `warn` (see `references/enforcement.md`) | error | warn | — |
| `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `frontend-architecture`, `next-best-practices`, `react-testing-library`, `zod`, `typescript-expert` | no explicit severity scale | a violation that breaks correctness, a contract, or a hard rule the skill states in absolute terms ("must", "never") | a violation the skill states as a strong recommendation | a stylistic or minor improvement |

For the four scale-less rows, judge each finding by what the source
skill's own language commits to, not by guessing:

- Skill text uses "must"/"never"/"required" and violating it breaks
  something (a build gate, a runtime contract, a security boundary) → **CRITICAL**.
- Skill text uses "should"/"prefer" → **WARNING**.
- Skill text uses "consider"/"optional"/mentions it as a nice-to-have → **SUGGESTION**.

When in doubt between two levels, pick the lower one — this gate exists
to block real blockers, not to nag. Over-reporting CRITICAL erodes trust
in the gate faster than under-reporting does.
