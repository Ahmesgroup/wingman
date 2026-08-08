# Billing Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /billing/purchase` (requires Idempotency-Key; creates Purchase + grants Entitlement on completion) and `POST /billing/webhook` (PSP callbacks; PaymentTransaction.providerRef unique; idempotent).

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
