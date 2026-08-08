# API Overview

**Status:** Decided (V4.1) · REST for business ops, WebSocket for real-time. Related: `WEBSOCKET_EVENTS.md`,
`ERROR_CATALOG.md`, `RATE_LIMITS.md`, `IDEMPOTENCY.md`.

Every endpoint documents: method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL
effects, Redis effects, WebSocket events, notifications, audit.

## Endpoint groups

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| Profile | `POST /me/profile`, `POST /me/consents` |
| Radar | `POST /radar/activate`, `POST /radar/deactivate`, `GET /radar/candidates` |
| Signal | `POST /signals`, `POST /signals/:id/open`, `POST /signals/:id/accept` |
| Connection | `POST /connections/:id/selfies/initiate`, `.../selfies/respond`, `POST /connections/:id/approve` |
| Ticket | `POST /tickets`, `POST /tickets/:id/availability` |
| Mission | `POST /missions/:id/messages`, `POST /missions/:id/confirm`, `POST /missions/:id/outcome` |
| Safety | `POST /users/:id/block`, `POST /reports` |
| Privacy | `POST /privacy/export`, `POST /privacy/delete-account` |
| Billing | `POST /billing/purchase`, `POST /billing/webhook` |
| Admin | moderation queue, identity review, privacy requests (admin-scoped) |

## Cross-cutting

- **Auth:** bearer session token (hashed server-side). Sensitive endpoints require a verified account.
- **Idempotency:** all state-changing endpoints accept `Idempotency-Key`; replays return current state. No
  financial effect without one.
- **Rate limits:** per user + per action (`RATE_LIMITS.md`); Radar candidate reads are throttled to deter scraping.
- **Silent expiry:** accept/selfie/approve endpoints never emit rejection notifications.
- **Server time:** responses to timed actions include `expiresAt`; clients render `expiresAt − serverTime`.
