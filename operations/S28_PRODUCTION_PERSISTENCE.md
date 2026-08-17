# S28 — Production Persistence Certification

**Status:** **IN PROGRESS** (infra provisioned; durability cert pending post-redeploy)  
**Updated:** 2026-08-17  
**PRODUCT PROTOCOL READY:** **NO**

## Locked status language

| Area | Status |
|------|--------|
| Protocol wiring | improved |
| Production durability | **BLOCKED / IN PROGRESS** |
| Private selfie media | **OPEN** |
| Two-phone Evidence Pack | **NOT STARTED / BLOCKED** (do not start until durability proven) |
| PRODUCT PROTOCOL READY | **NO** |

## Locked sequence

1. PostgreSQL Production réel (durable user/profile/connection/signal/mission/locks)
2. Redis Production réel (ephemeral presence/sessions/chat/timers)
3. Verify Production backend uses these stores — **NO memory fallback**
4. Redeploy
5. Durability scenario: write state → redeploy/restart → state returns
6. ONLY THEN human A/B Evidence Pack
7. Private selfie media = separate blocker (OPEN until private storage wired)

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
