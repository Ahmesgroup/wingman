# Mission Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /missions/:id/messages` (anti-contact filter before append to Redis stream), `POST /missions/:id/confirm` ("Let's meet" → Mission Mode), `POST /missions/:id/outcome` (records MissionResponse, derives metConfirmed, sets cooldown).

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
