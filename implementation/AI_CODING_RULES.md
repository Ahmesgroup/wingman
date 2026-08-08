# AI Coding Rules

**Status:** Decided · Mandatory for all AI agents and human contributors.

1. Never invent a product rule without documenting it (update the PRD + DECISION_LOG).
2. Read PRD, DECISION_LOG, and ADRs before any change.
3. Never bypass a state machine.
4. Never mutate protocol state directly from a controller — go through `packages/domain`.
5. Every transition is executed atomically (PostgreSQL transaction or Redis Lua).
6. Every sensitive action is idempotent (idempotency key).
7. Every two-user operation checks blocks first (both directions).
8. Every connection creation uses `ActiveUserLock` inside the creating transaction.
9. Never log: raw phone, selfie bytes/URLs, signed URLs, Mission Meet messages, precise location, tokens, evidence.
10. Never store ephemeral media in PostgreSQL.
11. Never treat the client as authoritative for timers; use absolute server `expiresAt`.
12. Never delete an already-deployed migration.
13. Any schema change requires: migration + test + update `database/DATABASE_SCHEMA.md` + DECISION_LOG entry.
14. Any product change requires a PRD update.
15. Any architecture change requires an ADR.
16. No sensitive endpoint without a rate limit.
17. No financial effect without an idempotency key.
18. No sensitive user text in analytics.
19. Terminal states are explicit; no implicit "done".
20. Finish every task with: typecheck, lint, tests, build, and a summary of changed files.

`packages/domain` must not import Prisma, NestJS, Redis, or AWS SDKs. It receives repositories and a `Clock` via
interfaces so the entire protocol is testable without infrastructure.
