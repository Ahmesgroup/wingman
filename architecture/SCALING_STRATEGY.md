# Scaling Strategy

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Start: one EU region, vertical DB scaling, Redis regional, read replicas when needed. Extract services only on
measured need — geo, moderation, notifications first. Consider Rust for proximity only if it becomes a proven
bottleneck (ADR-006). Radar can move to cell-partitioned Redis (D-012) when a single set is hot. Multi-region is a
later, evidence-driven step (ADR-002).
