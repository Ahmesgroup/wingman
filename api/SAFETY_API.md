# Safety Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /users/:id/block` (instant, silent, one-way; removes from feeds both ways) and `POST /reports` (category + optional text; may create/append ModerationCase; seals evidence if during a session).

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
