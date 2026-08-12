# Local Development

**Status:** Decided (V4.1) · Client loop updated 2026-08-12.

## Backend

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d   # Postgres + Redis (+ local object store)
# prisma migrate when using DATABASE_URL — see database docs
AUTH_ALLOW_DEV=true MEASUREMENT_ENABLED=true pnpm --filter @wingman/api dev
```

API: `http://localhost:3000` — health `/health`, live `/internal/live`.

## Mobile-first web client (prototype)

```bash
npx serve prototype -l 5173
# → http://localhost:5173/
```

- Talks to Nest with `x-user-id` (dev). Seeds `proto-alex` / `proto-peer`.
- If API is down → mock/demo mode (banner).
- Payments stay **disabled** (`PAYMENTS_ENABLED=false`); no checkout CTAs.
- Full notes: [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md), [`prototype/README.md`](../prototype/README.md).

## Smoke

```bash
pnpm --filter @wingman/billing test
pnpm --filter @wingman/api exec vitest run src/client-loop.smoke.test.ts
pnpm --filter @wingman/api exec vitest run src/billing.e2e.test.ts
```

## Mobile (native)

Expo / Turborepo mobile app remains a separate track; the current executable client for the protocol loop is the **prototype** web shell.
