# Admin Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Admin-scoped: moderation queue, identity review, privacy requests. Every evidence access writes ModerationAuditLog. Strong admin auth (see security/ADMIN_SECURITY.md).

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
