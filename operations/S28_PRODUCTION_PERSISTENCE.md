# S28 — Production Persistence Certification

**Status:** **GO (infra)** — Production uses Postgres + Redis; durability cert passed 2026-08-17  
**Updated:** 2026-08-17  
**PRODUCT PROTOCOL READY:** **NO** (Evidence Pack + selfie media still open)

## Locked status language

| Area | Status |
|------|--------|
| Protocol wiring | improved |
| Production durability | **GO (infra)** — steps 1–5 complete |
| Private selfie media | **OPEN** |
| Two-phone Evidence Pack | **NOT STARTED / BLOCKED** (do not start until product owner opens step 6; durability is no longer the blocker) |
| PRODUCT PROTOCOL READY | **NO** |

## Locked sequence progress

| Step | Status |
|------|--------|
| 1. PostgreSQL Production réel | **DONE** — Neon `wingman-pg` (fra1), migrations applied |
| 2. Redis Production réel | **DONE** — Upstash `wingman-redis` (fra1) |
| 3. No memory fallback | **DONE** — `WINGMAN_PUBLIC_PROD` fail-closed; `/internal/ready` = prisma/redis/postgres |
| 4. Redeploy | **DONE** |
| 5. Durability scenario | **DONE** — marker identity+connection survived Production redeploy (`scripts/s28-durability-cert.mjs`) |
| 6. Human A/B Evidence Pack | **NOT STARTED** |
| 7. Private selfie media | **OPEN** (no storage provider package in repo) |

## Provisioned (2026-08-17)

| Resource | Provider | Vercel resource | Region | Env (Production) |
|----------|----------|-----------------|--------|------------------|
| Postgres | Neon free_v3 | `wingman-pg` | fra1 / eu-central-1 | `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, … |
| Redis | Upstash free | `wingman-redis` | fra1 | `REDIS_URL`, `KV_*` |

Secrets never committed. Values live only in Vercel Production env for `wingman-api`.

## Code gates

- `WINGMAN_PUBLIC_PROD=true` → **fail-closed**: missing/unreachable `DATABASE_URL`/`POSTGRES_PRISMA_URL` or `REDIS_URL` aborts boot (no silent memory).
- Runtime Prisma URL preference: `POSTGRES_PRISMA_URL` ?? `DATABASE_URL`.
- Migrations applied on Neon: `0_invariants`, `20260809000000_s16_durable_protocol` (enums `Gender` / `InterestTarget` created in S16 SQL).

## Verify

```bash
curl -s https://wingman-api-three.vercel.app/internal/ready
# expect: persistence=prisma, ephemeral=redis, database=postgres, ready=true
```

Durability cert (local, after `vercel env pull`):

```bash
# from apps/api with Production env loaded (never commit .env*.local)
node ../../scripts/s28-durability-cert.mjs
# redeploy Production
node ../../scripts/s28-durability-cert.mjs --after-redeploy
```

## Not in this sprint step

- Two-phone Evidence Pack (step 6 — blocked until step 5 green)
- Private selfie media (OPEN — no storage provider package in repo yet)
- Destiny / payments remain OFF
