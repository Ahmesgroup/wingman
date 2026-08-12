# Production readiness (S12–S20)

**Status:** **Backend V1 certified GO** (see [`S20_PRODUCTION_CERTIFICATION.md`](./S20_PRODUCTION_CERTIFICATION.md)).  
**Full build narrative:** [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md)

## Purpose

This checklist proves the backend is operable as a production-shaped service envelope around the frozen protocol engine. S16–S19 delivered durable hydrate, WebSocket, providers, and entitlements. **S20 certifies** multi-instance, chaos/recovery, load/races, observability, and issues the binary go/no-go.

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
| Payment readiness fail-closed | `payment-provider.test.ts` + billing e2e checkout | Defaults: `PAYMENTS_DISABLED`; no Fake checkout fallback when enabled without creds |
| Billing architecture | S19 architecture gate | No Stripe SDK in domain/signals/connections/mission/destiny |
| Client loop smoke | `client-loop.smoke.test.ts` | Prototype path Radar→…→Cooldown; payments stay off |
| S20 multi-instance / chaos / load | `s20.certification.test.ts` | G1–G3 PASS |
| S20 observability | live/ready/metrics + requestId | G4 PASS |
| S20 go/no-go | [`S20_PRODUCTION_CERTIFICATION.md`](./S20_PRODUCTION_CERTIFICATION.md) | **GO** |
| Readiness endpoint | `GET /internal/ready` | `ready: true` with domain + ephemeral + persistence (+ database when configured) |
| Liveness endpoint | `GET /internal/live` | Process up (orchestration) |
| Structured logs | `packages/observability` tests | Sensitive fields redacted; `requestId` correlated |
| Metrics | `GET /internal/metrics` includes `http` (p50/p95/p99) + `persistence` | Counters present |

## Run

```bash
pnpm -r test
pnpm --filter @wingman/api test -- src/s20.certification.test.ts
pnpm --filter @wingman/api dev
curl -s localhost:3000/health
curl -s localhost:3000/internal/live
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
| `SMS_PROVIDER` | Prefer real adapter | `console` / `noop` are stubs |
| `PUSH_PROVIDER` | Prefer APNs/FCM | `logging` / `memory` are stubs |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY` | Only if enabling Stripe | Require `PAYMENTS_ENABLED=true` + full creds |
| `PAYMENTS_ENABLED` | Default **false** | Fail-closed; see [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md) |
| `PAYMENT_PROVIDER` | Default `disabled` | `disabled` \| `stripe` \| `paddle` |
| `WINGMAN_PLUS_PRICE_ID` / `WINGMAN_PLUS_PRODUCT_ID` | With live provider | Server-side only |
| `DESTINY_ENABLED` | Default false | DPIA before enabling |
| `PORT` | As needed | Default 3000 |

## Chaos (certified)

Covered by S20 G2 + prior gates: API restart/hydrate, ephemeral down → readiness fail, push DEAD without protocol failure, Stripe signature reject without core outage, concurrent accept single Match.

## Explicit gaps (ops / V1.1 — not V1 blockers)

- Staging credentials for Twilio + FCM HTTP v1 + APNs JWT + Stripe/Paddle (payments stay disabled until cert)
- Multi-region, autoscaling runbooks beyond compose
- Large-scale load campaign in real Redis/Postgres (S20 certifies invariants under concurrency, not millions of users)

## Not in Backend V1 (open as V1.1+)

Destiny V2, ranking radar, behavioral anti-abuse, geospatial optimization, adaptive intelligence.
