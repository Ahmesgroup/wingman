# Radar Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /radar/activate` / `deactivate` (presence in Redis). `GET /radar/candidates` returns anonymized dots after compatibility + block + state filters; throttled to deter scraping; never returns exact location, photo, name, or token.

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
