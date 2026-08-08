# ADR-001 — Modular Monolith (NestJS)
**Status:** Accepted
**Context:** Small team / early EU launch. A microservice split adds deployment, observability, inter-service
calls, consistency and contract-versioning overhead before it is needed.
**Decision:** One NestJS modular monolith (Auth, Profile, Radar, Signals, Connection, Missions, Safety, Billing,
Privacy) with a pure `packages/domain`.
**Consequences:** Atomic transactions across the protocol, one deployable, one observability stack. Extraction path
preserved (geo, moderation, notifications first).
