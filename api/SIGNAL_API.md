# Signal Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /signals` (guards: not self, not blocked, no active signal for pair, quota; expiresAt +10m), `POST /signals/:id/open`, `POST /signals/:id/accept` (atomic: close signal + create Connection + two ActiveUserLock). Silent 10-min expiry. Idempotent.

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
