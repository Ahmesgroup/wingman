# Test Strategy

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Pyramid: many pure domain unit tests (state machines, pair normalization, timers via injected Clock, entitlements,
compatibility, cooldown, retention, consent), integration tests (PostgreSQL, Redis, workers, transactions, locks,
idempotency, reconnection), E2E (onboarding→meeting, report, deletion, purchase), and concurrency tests. Quality
gates: TS strict, no unjustified `any`, lint, Prisma validate, migration test, secret scan, dependency audit, SAST,
prototype smoke, Markdown link check.
