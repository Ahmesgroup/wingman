# Ticket Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /tickets` (duration from entitlement: 2h/24h), `POST /tickets/:id/availability` (notify peer; 15-min confirm window else silent expiry). No chat during ticket.

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
