# Connection Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /connections/:id/selfies/initiate` and `.../selfies/respond` (opaque media ids; presigned upload; server sets window expiresAt) and `POST /connections/:id/approve` (mutual validation → Mission Meet). No rejection notifications.

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
