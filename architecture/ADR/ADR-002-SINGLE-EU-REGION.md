# ADR-002 — Single EU Region
**Status:** Accepted
**Context:** GDPR residency, low local latency, no proven global demand at launch.
**Decision:** Deploy one EU region; PostgreSQL primary in the EU; replication only when justified.
**Consequences:** Simpler compliance and ops. Multi-region is deferred (see ADR none / DECISION_LOG D-001).
