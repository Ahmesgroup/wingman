# ADR-004 — Ephemeral Media
**Status:** Accepted
**Context:** Selfies are highly sensitive.
**Decision:** Private EU bucket + SSE; opaque ids in Redis; short signed access scoped to recipient+session;
event-driven deletion + lifecycle backstop + reconciliation; never public URLs; never in Postgres.
**Consequences:** Reduced exposure window. Honest limits documented (no absolute anti-capture claim).
