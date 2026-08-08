# Production readiness (S12–S19)

**Status:** Measured against the S8–S19 envelope (domain S0–S7 frozen).  
**Full build narrative:** [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md)

## Purpose

This checklist proves the backend is operable as a production-shaped service envelope around the frozen protocol engine. S16–S19 cover durable hydrate, WebSocket transport, production-shaped SMS/push provider ports, and billing → entitlements.

## Checks

| Check | How measured | Gate |
|-------|----------------|------|
| Domain regression | `pnpm --filter @wingman/domain test` | 15 tests green (frozen baseline) |
| Nest API e2e loop | `pnpm --filter @wingman/api test` → `e2e.test.ts` | Full protocol over HTTP without frontend |
| Controllers stay thin | `architecture.test.ts` | Controllers do not inject/call `WingmanEngine` |
| Auth non-replay | `packages/auth` + `auth.e2e.test.ts` | Revoke and device mismatch fail closed |
| Ephemeral locks | `packages/ephemeral` + `multi-instance.test.ts` | Single accept winner across instances |
| Push idempotency | `packages/notifications` + `packages/providers` tests | No double send; DLQ after max retries |
| Persistence mirror | `packages/persistence` + `persistence.e2e.test.ts` | HTTP mutations mirrored; readiness includes persistence |
| Boot hydrate / restart | `hydrate.test.ts` + `restart.e2e.test.ts` | Durable state restored; presence not revived |
| WebSocket transport | `ws.e2e.test.ts` + realtime package tests | Signal/match live; unauth rejected; block forbids rooms; dual-device sync |
| WS architecture | `architecture.test.ts` | Gateway does not import `@wingman/domain` |
| Provider ports | `packages/providers` + S18 architecture gate | Twilio/FCM/APNs behind ports; no vendors in protocol modules |
| OTP SMS port | `providers` + auth OTP path | SMS queued via port; phone/OTP body redacted in logs |
| Push reliability | orchestrator + mobile transport tests | Idempotent; invalid tokens deactivated; outage ≠ protocol failure |
| Billing → entitlements | `packages/billing` + `billing.e2e.test.ts` | Free/Plus caps; webhook idempotence; no client self-promote; Stripe outage ≠ core failure |
| Billing architecture | S19 architecture gate | No Stripe SDK in domain/signals/connections/mission/destiny |
| Readiness endpoint | `GET /internal/ready` | `ready: true` with domain + ephemeral + persistence (+ database when configured) |
| Structured logs | `packages/observability` tests | Sensitive fields redacted |
| Metrics | `GET /internal/metrics` includes `http` + `persistence` | Counters present |

## Run

```bash
pnpm -r test
pnpm --filter @wingman/api dev
curl -s localhost:3000/internal/ready
curl -s localhost:3000/internal/metrics
```

## Environment (production-shaped)

| Variable | Required in prod | Notes |
|----------|------------------|-------|
| `AUTH_PEPPER` | Yes | Rotate; never use default |
| `AUTH_DEBUG_OTP` | Must be unset/false | Never expose OTP codes |
| `REDIS_URL` | Recommended | Memory store is single-instance only |
| `DATABASE_URL` | Yes for durable restart | Live `LivePrismaProtocolRepository` |
| `SMS_PROVIDER` | Prefer real adapter later | `console` / `noop` are stubs |
| `PUSH_PROVIDER` | Prefer APNs/FCM later | `logging` is a stub |
| `DESTINY_ENABLED` | Default false | DPIA before enabling |
| `PORT` | As needed | Default 3000 |

## Chaos (minimal)

1. Kill API mid-mission → client reconciles via `GET /connections/:id` + server `expiresAt`.
2. Reconcile worker / `POST /internal/reconcile` recovers expired signals/connections without exact-second cron.
3. Duplicate push enqueue with same idempotency key → ignored.
4. Two concurrent accepts on the same signal with shared ephemeral store → one connection only.

## Explicit gaps before “full prod”

- Staging credentials for Twilio + FCM HTTP v1 + APNs JWT (adapters ready)
- S19 Stripe entitlements
- S20 multi-instance / outage certification
- Multi-region, autoscaling runbooks beyond compose
- Load/chaos automation in CI

## Not in scope until post-S20

Destiny V2, ranking radar, behavioral anti-abuse, geospatial optimization, adaptive intelligence.
