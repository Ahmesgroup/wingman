# Wingman backend engine

Backend monorepo implementing the Wingman protocol loop:

`Presence → Radar → Signal → Mutual Validation → Match → Mission → Cooldown → Radar`

(+ Destiny behind `DESTINY_ENABLED` feature flag).

## Packages

- `packages/domain` — pure state machines (server-authoritative `expiresAt`)
- `packages/contracts` — Zod request contracts + error catalog
- `packages/database` — Prisma schema + invariant migration stubs
- `apps/api` — HTTP API (modular Express; domain is authority)
- `apps/workers` — expiration reconciler

## Quick start

```bash
pnpm install
pnpm --filter @wingman/domain test
pnpm -r test
docker compose -f infrastructure/docker/docker-compose.yml up -d
pnpm --filter @wingman/api dev
```

Authority rule: clients request transitions; they never declare timers or terminal states.
