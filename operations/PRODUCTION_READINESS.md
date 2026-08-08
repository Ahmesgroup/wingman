# Production readiness (S12)

**Status:** Measured against the S8–S12 envelope (domain S0–S7 frozen).

## Checks

| Check | How measured | Gate |
|-------|----------------|------|
| Domain regression | `pnpm --filter @wingman/domain test` | 15 tests green |
| Nest API e2e loop | `pnpm --filter @wingman/api test` | protocol e2e green |
| Auth non-replay | auth package + auth e2e | revoke/device mismatch fail |
| Ephemeral locks | ephemeral + multi-instance test | single accept winner |
| Push idempotency | notifications package tests | no double send; DLQ after max retries |
| Readiness endpoint | `GET /internal/ready` | `ready: true` with domain + ephemeral checks |
| Structured logs | observability package | sensitive fields redacted |
| Metrics | `GET /internal/metrics` includes `http` snapshot | counters present |

## Run

```bash
pnpm -r test
pnpm --filter @wingman/api dev
curl -s localhost:3000/internal/ready
```

## Chaos (minimal)

1. Kill API mid-mission → client reconciles via `GET /connections/:id` + server `expiresAt`.
2. Reconcile worker/`POST /internal/reconcile` recovers expired signals/connections without exact-second cron.
3. Duplicate push enqueue with same idempotency key → ignored.

## Not in scope until post-S12

Destiny V2, ranking radar, behavioral anti-abuse, geospatial optimization, adaptive intelligence.
