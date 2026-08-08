# ADR-003 — PostgreSQL + Redis
**Status:** Accepted
**Context:** Durable relational data vs ephemeral real-time state.
**Decision:** PostgreSQL for durable data; Redis for presence, sessions, chat, timers, rate limits.
**Consequences:** Clear separation; sensitive Redis namespaces follow the persistence policy in
`REDIS_ARCHITECTURE.md`. No "nothing on disk" claims.
