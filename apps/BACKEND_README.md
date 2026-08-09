# Wingman Backend — Developer Guide

**Status:** Implemented · Full narrative: [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md)

Executable backend for the Wingman protocol loop:

`Presence → Radar → Signal → Mutual Validation → Match → Mission → Cooldown → Radar`

(+ Destiny behind `DESTINY_ENABLED`, default **off**).

## Rules

1. **S0–S7 domain is frozen** (`packages/domain`). Do not change protocol rules to fit Nest/Redis.
2. **Backend is state authority.** Clients request transitions; timers use server `expiresAt` (UTC).
3. Controllers are HTTP-only; services call `WingmanEngine`.

## Packages

| Package | Role |
|---------|------|
| `@wingman/domain` | Pure protocol engine (**frozen**) |
| `@wingman/contracts` | Zod DTOs + error catalog |
| `@wingman/database` | Prisma schema + invariant SQL stubs |
| `@wingman/auth` | OTP, sessions, refresh, device binding |
| `@wingman/ephemeral` | Presence/TTL/locks/quotas (memory or Redis) |
| `@wingman/notifications` | Push orchestrator (idempotency, retries, DLQ) |
| `@wingman/observability` | Structured logs, metrics, readiness |
| `@wingman/persistence` | Protocol write-behind (`ProtocolPersistenceMirror`) |
| `@wingman/providers` | SMS OTP + push transport ports (stubs) |
| `@wingman/billing` | Stripe port → billing state → entitlements |
| `@wingman/radar-intelligence` | V1.1 S21 contextual radar ranking (flagged) |
| `@wingman/context-engine` | V1.1 S22 normalized ephemeral context (flagged) |
| `@wingman/destiny-v2` | V1.1 S23 rare Destiny proposals + mutual consent (flagged) |
| `@wingman/anti-abuse` | V1.1 S24 observation + graduated enforcement (flagged) |
| `@wingman/geo-intelligence` | V1.1 S25 ephemeral spatial relevance (flagged) |
| `@wingman/realtime` | WS envelope, rooms, hub, replay buffer |
| `@wingman/api` | NestJS modular HTTP + WebSocket API |
| `@wingman/workers` | Expiration reconciler |

## Quick start

```bash
pnpm install
pnpm -r test

docker compose -f infrastructure/docker/docker-compose.yml up -d

# Dev API (DevAuthGuard: pass x-user-id)
AUTH_DEBUG_OTP=true pnpm --filter @wingman/api dev

curl -s localhost:3000/health
curl -s localhost:3000/internal/ready
```

Optional:

- `REDIS_URL=redis://127.0.0.1:6379` — Redis ephemeral store
- `DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman` — live Prisma protocol persistence + boot hydrate
- `SMS_PROVIDER=noop` — disable console SMS
- `PUSH_PROVIDER=logging` — log push deliveries

S16: [`operations/S16_PERSISTENCE_LIVE.md`](../operations/S16_PERSISTENCE_LIVE.md) · S17 `/ws`: [`operations/S17_WEBSOCKET.md`](../operations/S17_WEBSOCKET.md) · S18 providers: [`operations/S18_PROVIDERS.md`](../operations/S18_PROVIDERS.md) · S19 billing: [`operations/S19_BILLING_ENTITLEMENTS.md`](../operations/S19_BILLING_ENTITLEMENTS.md) · S20: [`operations/S20_PRODUCTION_CERTIFICATION.md`](../operations/S20_PRODUCTION_CERTIFICATION.md) (**Backend V1 GO**) · S21: [`operations/S21_RADAR_INTELLIGENCE.md`](../operations/S21_RADAR_INTELLIGENCE.md) · S22: [`operations/S22_CONTEXT_ENGINE.md`](../operations/S22_CONTEXT_ENGINE.md) · S23: [`operations/S23_DESTINY_V2.md`](../operations/S23_DESTINY_V2.md) · S24: [`operations/S24_ANTI_ABUSE.md`](../operations/S24_ANTI_ABUSE.md) · S25: [`operations/S25_GEO_INTELLIGENCE.md`](../operations/S25_GEO_INTELLIGENCE.md).

`POST /devices/push-token` registers FCM/APNs tokens for the authenticated user.  
`GET /billing/entitlements` returns effective plan capabilities (never trust client `isPremium`).  
`GET /internal/live` · `GET /internal/ready` · `GET /internal/metrics` for orchestration and ops.  
`GET /radar/candidates` — V1 eligibility; optional S21 reorder when `RADAR_INTELLIGENCE_ENABLED=true`; optional S22 context when `CONTEXT_ENGINE_ENABLED=true` (scores/context never in response).  
Destiny: `POST /destiny/copresence` — V1 when `DESTINY_V2_ENABLED` off; V2 candidate/policy when on; shadow when `DESTINY_V2_PROPOSALS_ENABLED=false`; live consent via `/destiny/proposals/*` (handoff to V1 Signal/Connection on mutual).  
Anti-abuse: optional Nest gates when `ANTI_ABUSE_ENABLED=true`; shadow when `ANTI_ABUSE_ENFORCEMENT_ENABLED=false`; enforcement returns `ABUSE_*` without changing domain rules.  
Geo: when `GEO_INTELLIGENCE_ENABLED=true`, Radar activate/heartbeat ingest ephemeral spatial snapshots (`GeoContextPort`); never exact lat/lng on candidate HTTP; V1 eligibility radii unchanged.

## Auth modes

| Mode | How |
|------|-----|
| Dev (default e2e) | Header `x-user-id: <userId>` |
| Session | `POST /auth/otp/*` then `Authorization: Bearer <token>` + `x-device-id` |

## Main HTTP surface

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | Public | Liveness |
| GET | `/internal/ready` | Public | Readiness aggregate |
| GET | `/internal/metrics` | Public | Engine + HTTP metrics |
| POST | `/internal/reconcile` | Public | Expire presence/signals/connections |
| POST | `/dev/seed` | Public | Seed test user into engine |
| POST | `/auth/otp/request` | Public | Start OTP |
| POST | `/auth/otp/verify` | Public | Issue session |
| POST | `/auth/refresh` | Public | Rotate session |
| POST | `/auth/logout` | Public | Revoke access token |
| POST | `/radar/activate` | User | Presence + location |
| POST | `/radar/deactivate` | User | Leave radar |
| POST | `/radar/heartbeat` | User | Refresh TTL |
| GET | `/radar/candidates` | User | Anonymized candidates |
| POST | `/signals` | User | Create signal (`Idempotency-Key` supported) |
| POST | `/signals/:id/open\|refuse\|cancel\|accept` | User | Signal lifecycle |
| GET | `/connections/:id` | User | Connection state + `expiresAt` |
| POST | `/connections/:id/selfie` | User | Opaque `mediaId` only |
| POST | `/connections/:id/approve` | User | → `MUTUALLY_VALIDATED` |
| POST | `/connections/:id/meet-now` | User | Start Mission Meet |
| POST | `/connections/:id/ticket*` | User | Hold / available / confirm |
| POST | `/connections/:id/messages` | User | Anti-contact filtered |
| POST | `/connections/:id/outcome` | User | YES/NO → cooldown |
| POST | `/safety/block` | User | Immediate radar exclusion |
| POST | `/safety/report` | User | Report record |
| POST | `/privacy/consent` | User | Append-only consent |
| POST | `/destiny/copresence` | User | Fails if Destiny disabled |

## Tests to trust

```bash
pnpm --filter @wingman/domain test          # 15 protocol tests (freeze baseline)
pnpm --filter @wingman/api test             # Nest e2e + S20 certification + architecture
pnpm --filter @wingman/api test -- src/s20.certification.test.ts
pnpm --filter @wingman/persistence test
pnpm --filter @wingman/providers test
pnpm --filter @wingman/billing test
pnpm --filter @wingman/radar-intelligence test
pnpm --filter @wingman/context-engine test
pnpm -r test                                 # everything
```

## Production readiness

See [`operations/PRODUCTION_READINESS.md`](../operations/PRODUCTION_READINESS.md).
