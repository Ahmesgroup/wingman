# Staging Load Certification (infra)

**Status:** **GO** · Certified · **Date:** 2026-08-11  
**Nature:** Short infra certification — **not** a product sprint  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S20_PRODUCTION_CERTIFICATION.md`](./S20_PRODUCTION_CERTIFICATION.md), [`S24.1_DESTINY_PROPOSAL_PERSISTENCE.md`](./S24.1_DESTINY_PROPOSAL_PERSISTENCE.md)

## Principle

Prove **S21–S24.1** under **real concurrency** on shared Redis + Postgres:

| Concern | What we prove |
|---------|----------------|
| Shared Redis | Ephemeral locks, quotas, pub/sub |
| Destiny proposal store | `RedisDestinyProposalStore` visible across Nest instances |
| Destiny locks | `destiny-accept:{id}` → single V1 handoff |
| Quotas | FREE Signal daily cap under concurrent creates |
| Realtime bus | Redis pub/sub delivers eventIds |
| Postgres | Concurrent mirrors + `SELECT 1` latency budget |

S20 remains the **memory** Backend V1 certificate. This doc is the **staging load** certificate for V1.1 infra paths.

## Soft-pass rule

`apps/api/src/staging.load.certification.test.ts` **soft-passes** when `REDIS_URL` or `DATABASE_URL` is unset/unreachable so default CI stays green.  
**Live GO** requires both URLs and all L1–L5 asserting (not soft-passing).

## Environment tested (live GO)

| Item | Value |
|------|--------|
| OS | Windows 10/11 |
| Node | ≥20 |
| Redis | Redis on Windows 3.0.504 (`REDIS_URL=redis://127.0.0.1:6379`) — GEO index best-effort (unsupported on 3.0; presence/locks/quotas/pubsub used) |
| Postgres | PostgreSQL 15 (`DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman`) |
| Date (UTC) | 2026-08-11 |
| Suite | `apps/api/src/staging.load.certification.test.ts` |

**Note:** Prefer Redis ≥6 / Docker `redis:7` / Memurai for full `GEOADD` support. Presence TTL + domain locations remain authoritative when GEO is skipped.

## Commands

```bash
# Soft-pass mode (no infra)
pnpm --filter @wingman/api test -- src/staging.load.certification.test.ts
# or: pnpm cert:staging

# Live mode (PowerShell)
$env:REDIS_URL="redis://127.0.0.1:6379"
$env:DATABASE_URL="postgresql://wingman:wingman@127.0.0.1:5432/wingman"
pnpm --filter @wingman/database exec prisma db push --schema=./prisma/schema.prisma
pnpm cert:staging
```

## Gate results (live 2026-08-11)

| Gate | Proof | Result |
|------|-------|--------|
| **L0** | Probe live URLs | **PASS** |
| **L1** | Nest A consent → Nest B list → MUTUAL handoff once (Redis proposal store) | **PASS** |
| **L2** | Concurrent Destiny accept → one connection (Redis locks) | **PASS** |
| **L3** | Concurrent FREE signals → quota ≤ 2/day | **PASS** |
| **L4** | Redis pub/sub delivers `eventId` on `wingman.realtime` | **PASS** |
| **L5** | Concurrent seeds + Postgres `SELECT 1` p95 &lt; 500ms; `/internal/ready` | **PASS** |

## Binary verdict

| Verdict | Meaning |
|---------|---------|
| **SUITE READY** | Automated gates exist; soft-pass without Docker |
| **GO** | L1–L5 live pass on shared Redis + Postgres |
| **NO-GO** | Any live gate fails under real concurrency |

**Current:** **GO**

## Out of scope

- City-scale load (`testing/LOAD_TESTING.md`)
- S26 baseline campaign / S27 learning
- Product rule changes

## Next after GO

S26 measurement baselines campaign (`MEASUREMENT_ENABLED=true`, learning off) → S27 decision gate.
