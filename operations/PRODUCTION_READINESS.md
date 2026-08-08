# Production readiness (S12)

**Status:** Measured against the S8–S12 envelope (domain S0–S7 frozen).  
**Full build narrative:** [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md)

## Purpose

This checklist proves the backend is operable as a production-shaped service envelope around the frozen protocol engine. It does **not** claim full cloud deploy, SMS, or APNs/FCM are wired — those are explicit next steps after S12.

## Checks

| Check | How measured | Gate |
|-------|----------------|------|
| Domain regression | `pnpm --filter @wingman/domain test` | 15 tests green (frozen baseline) |
| Nest API e2e loop | `pnpm --filter @wingman/api test` → `e2e.test.ts` | Full protocol over HTTP without frontend |
| Controllers stay thin | `architecture.test.ts` | Controllers do not inject/call `WingmanEngine` |
| Auth non-replay | `packages/auth` + `auth.e2e.test.ts` | Revoke and device mismatch fail closed |
| Ephemeral locks | `packages/ephemeral` + `multi-instance.test.ts` | Single accept winner across instances |
| Push idempotency | `packages/notifications` tests | No double send; DLQ after max retries |
| Readiness endpoint | `GET /internal/ready` | `ready: true` with domain + ephemeral checks |
| Structured logs | `packages/observability` tests | Sensitive fields redacted |
| Metrics | `GET /internal/metrics` includes `http` snapshot | Counters present |

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
| `DESTINY_ENABLED` | Default false | DPIA before enabling |
| `PORT` | As needed | Default 3000 |

## Chaos (minimal)

1. Kill API mid-mission → client reconciles via `GET /connections/:id` + server `expiresAt`.
2. Reconcile worker / `POST /internal/reconcile` recovers expired signals/connections without exact-second cron.
3. Duplicate push enqueue with same idempotency key → ignored.
4. Two concurrent accepts on the same signal with shared ephemeral store → one connection only.

## Explicit gaps before “full prod”

- PostgreSQL persistence of protocol entities (Prisma schema present; engine state still in-memory)
- Real SMS OTP provider
- APNs / FCM push transport
- Multi-region, autoscaling runbooks beyond compose
- Load/chaos automation in CI

## Not in scope until post-S12

Destiny V2, ranking radar, behavioral anti-abuse, geospatial optimization, adaptive intelligence.
