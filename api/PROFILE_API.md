# Profile Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /me/profile` (validates ≤5 interests, height range, bio ≤150, birthDate → age ≥18) and `POST /me/consents` (append-only ConsentEvent per purpose with version+hash+locale+source).

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
