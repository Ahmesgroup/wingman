# API Test Matrix

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Per endpoint: auth required, rate limit enforced, idempotency replay returns same state, correct PostgreSQL/Redis
effects, correct WebSocket events, no rejection notifications on silent-expiry paths, and error codes from
`../api/ERROR_CATALOG.md`.
