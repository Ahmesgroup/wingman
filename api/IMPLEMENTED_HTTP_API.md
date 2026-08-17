# Implemented HTTP API (NestJS)

**Status:** Implemented in `apps/api` · Complements the product-facing sketches under [`api/`](../api/).  
**Narrative:** [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md)

This document lists **routes that exist in code today**. Product API docs under `api/*.md` remain the longer-term contract sketches; when they diverge, prefer this file + OpenAPI (future) for “what runs”.

## Conventions

| Item | Value |
|------|--------|
| Base URL (local) | `http://localhost:3000` |
| Dev identity | Header `x-user-id` |
| Session identity | `Authorization: Bearer <accessToken>` + `x-device-id` |
| Idempotency | Header `Idempotency-Key` on `POST /signals` |
| Errors | `{ "error": { "code", "message", "details?" } }` |
| Time | UTC ISO-8601; clients render `expiresAt - serverTime` |

## Public

| Method | Path | Body / notes |
|--------|------|----------------|
| GET | `/health` | `{ ok, utc, destinyEnabled }` |
| GET | `/internal/ready` | Readiness aggregate |
| GET | `/internal/metrics` | Engine + HTTP metrics |
| POST | `/internal/reconcile` | Run expiration pass |
| POST | `/dev/seed` | `{ id, gender, interestedIn, wingmanPlus? }` |
| POST | `/auth/otp/request` | `{ phoneE164 }` → `{ challengeId, debugCode? }` |
| POST | `/auth/otp/verify` | `{ phoneE164, code, deviceId }` → tokens |
| POST | `/auth/refresh` | `{ refreshToken, deviceId }` |
| POST | `/auth/logout` | Bearer access token |

## Authenticated (user)

| Method | Path | Body / notes |
|--------|------|----------------|
| GET | `/me` | Current user profile (null until set) |
| POST | `/me/profile` | `{ gender, interestedIn, firstName?, birthDate?, heightCm?, interests?, dailyBio? }` — age ≥18 |
| POST | `/radar/activate` | `{ lat, lng, visibility? }` |
| POST | `/radar/deactivate` | — |
| POST | `/radar/heartbeat` | `{ lat?, lng? }` |
| GET | `/radar/candidates` | Query `nearRadiusM`, `aroundRadiusM` |
| POST | `/signals` | `{ receiverId, source? }` |
| POST | `/signals/:id/open` | Recipient |
| POST | `/signals/:id/refuse` | Recipient (silent to sender) |
| POST | `/signals/:id/cancel` | Sender |
| POST | `/signals/:id/accept` | Creates Connection + locks |
| GET | `/connections/:id` | `{ connection, serverTime }` |
| POST | `/connections/:id/media` | multipart `file` → private store → `{ mediaId, contentType, byteLength, expiresAt }` |
| GET | `/connections/:id/media/:mediaId` | Authorized stream (`Cache-Control: no-store, private`); peer only after bind |
| POST | `/connections/:id/selfie` | `{ mediaId }` opaque only — must be registered upload for actor |
| POST | `/connections/:id/approve` | Initiator → `MUTUALLY_VALIDATED` |
| POST | `/connections/:id/meet-now` | → `MISSION_MEET_ACTIVE` |
| POST | `/connections/:id/ticket` | Hold ticket |
| POST | `/connections/:id/ticket/available` | Start confirm window |
| POST | `/connections/:id/ticket/confirm` | → mission |
| POST | `/connections/:id/lets-meet` | Mission confirm |
| POST | `/connections/:id/not-this-time` | → outcome pending |
| POST | `/connections/:id/messages` | `{ text }` anti-contact filtered + `mission.message` realtime |
| GET | `/connections/:id/messages` | Participant-only message list (reconnect restore) |
| POST | `/connections/:id/outcome` | `{ outcome: YES\|NO }` |
| POST | `/connections/:id/cooldown/skip` | Early complete |
| POST | `/safety/block` | `{ userId }` |
| POST | `/safety/report` | `{ userId, category, connectionId? }` |
| POST | `/privacy/consent` | `{ purpose, policyVersion }` |
| POST | `/destiny/copresence` | `{ otherUserId }` — 503 if Destiny disabled |

## Feature flags

| Flag | Effect |
|------|--------|
| `DESTINY_ENABLED=true` | Allows Destiny prompt emission |
| `AUTH_DEBUG_OTP=true` | Returns OTP `debugCode` (never in production) |
| `REDIS_URL` | Switches ephemeral store to Redis |

## Related product API sketches

- [`api/RADAR_API.md`](RADAR_API.md), [`api/SIGNAL_API.md`](SIGNAL_API.md), [`api/CONNECTION_API.md`](CONNECTION_API.md)
- [`api/MISSION_API.md`](MISSION_API.md), [`api/AUTH_API.md`](AUTH_API.md), [`api/SAFETY_API.md`](SAFETY_API.md)
- [`api/ERROR_CATALOG.md`](ERROR_CATALOG.md), [`api/IDEMPOTENCY.md`](IDEMPOTENCY.md)
