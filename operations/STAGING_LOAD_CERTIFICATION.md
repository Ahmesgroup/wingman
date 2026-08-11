# Staging Load Certification (infra)

**Status:** **SUITE READY** · Live verdict **PENDING** until Redis + Postgres are reachable  
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

## Environment

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d

pnpm --filter @wingman/database prisma:generate
DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman \
  pnpm --filter @wingman/database exec prisma db push --schema=./prisma/schema.prisma
```

| Variable | Example |
|----------|---------|
| `REDIS_URL` | `redis://127.0.0.1:6379` |
| `DATABASE_URL` | `postgresql://wingman:wingman@127.0.0.1:5432/wingman` |

## Commands

```bash
# Soft-pass mode (no infra) — suite loads, gates warn and return
pnpm --filter @wingman/api test -- src/staging.load.certification.test.ts

# Live mode
REDIS_URL=redis://127.0.0.1:6379 \
DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman \
  pnpm --filter @wingman/api test -- src/staging.load.certification.test.ts
```

Windows PowerShell:

```powershell
$env:REDIS_URL="redis://127.0.0.1:6379"
$env:DATABASE_URL="postgresql://wingman:wingman@127.0.0.1:5432/wingman"
pnpm --filter @wingman/api test -- src/staging.load.certification.test.ts
```

## Gates

| Gate | Proof | Live result |
|------|-------|-------------|
| **L0** | Probe / soft-pass documentation | soft-pass until infra up |
| **L1** | Nest A consent → Nest B list → MUTUAL handoff once (Redis proposal store) | pending |
| **L2** | Concurrent Destiny accept → one connection (Redis locks) | pending |
| **L3** | Concurrent FREE signals → quota ≤ 2/day | pending |
| **L4** | Redis pub/sub delivers `eventId` on `wingman.realtime` | pending |
| **L5** | Concurrent seeds + Postgres `SELECT 1` p95 &lt; 500ms; `/internal/ready` | pending |

## Binary verdict

| Verdict | Meaning |
|---------|---------|
| **SUITE READY** | Automated gates exist; soft-pass without Docker |
| **GO** | L1–L5 live pass on shared Redis + Postgres |
| **NO-GO** | Any live gate fails under real concurrency |

**Current:** **SUITE READY / LIVE PENDING** (this agent host: Docker CLI absent, Redis port closed, local Postgres credentials ≠ compose defaults).

## Out of scope

- City-scale load (`testing/LOAD_TESTING.md`)
- S26 baseline campaign / S27 learning
- Product rule changes

## Next after GO

S26 measurement baselines campaign (`MEASUREMENT_ENABLED=true`, learning off) → S27 decision gate.
