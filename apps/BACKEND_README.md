# Wingman backend engine

Backend monorepo implementing the Wingman protocol loop:

`Presence → Radar → Signal → Mutual Validation → Match → Mission → Cooldown → Radar`

(+ Destiny behind `DESTINY_ENABLED` feature flag).

**S0–S7 domain is frozen.** S8–S12 wrap it with NestJS, auth, Redis ephemeral envelope, push, observability.

## Packages

- `packages/domain` — pure state machines (server-authoritative `expiresAt`) — **frozen**
- `packages/contracts` — Zod request contracts + error catalog
- `packages/database` — Prisma schema + invariant migration stubs
- `packages/auth` — OTP, sessions, refresh/revoke, device binding
- `packages/ephemeral` — Redis/memory presence, locks, quotas, pub/sub
- `packages/notifications` — push orchestrator (idempotency, retries, DLQ)
- `packages/observability` — structured logs, metrics, readiness helper
- `apps/api` — NestJS modular API (controllers thin; services call domain)
- `apps/workers` — expiration reconciler

## Quick start

```bash
pnpm install
pnpm -r test
docker compose -f infrastructure/docker/docker-compose.yml up -d
# optional: REDIS_URL=redis://127.0.0.1:6379 AUTH_DEBUG_OTP=true
pnpm --filter @wingman/api dev
curl -s localhost:3000/internal/ready
```

Authority rule: clients request transitions; they never declare timers or terminal states.

Readiness checklist: [operations/PRODUCTION_READINESS.md](../operations/PRODUCTION_READINESS.md).
