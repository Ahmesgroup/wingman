# Privacy Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /privacy/export` (JSON bundle via PrivacyRequest) and `POST /privacy/delete-account` (erasure within 72h subject to legal retention of specific records).

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
