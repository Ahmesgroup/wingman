# S16 — Live Prisma + deterministic boot hydration

**Status:** Implemented · Part of [`BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md)

## Invariant

> PostgreSQL contains the durable state required for reconstruction; Redis contains only what can expire or be rebuilt.

| Store | Owns |
|-------|------|
| PostgreSQL (`Protocol*` tables) | Users (protocol identity), signals, connections, blocks, reports, consents, signal usage |
| Redis / ephemeral | Presence TTL, transient radar coords, distributed locks, rate limits, short coordination |

Presence is **never** restored on boot. Clients must re-activate radar.

## Flow

```text
mutations → ProtocolPersistenceMirror → LivePrismaProtocolRepository → PostgreSQL
boot → loadForHydration → applyHydrationSnapshot → WingmanEngine.reconcile()
```

## Commands

```bash
# Generate client + apply schema (dev)
pnpm --filter @wingman/database prisma:generate
DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman \
  pnpm --filter @wingman/database exec prisma db push --schema=./prisma/schema.prisma

# API with live persistence
DATABASE_URL=postgresql://wingman:wingman@127.0.0.1:5432/wingman \
  pnpm --filter @wingman/api dev
```

Without `DATABASE_URL`, API falls back to `MemoryProtocolRepository` (same hydrate API).

## Gate

`pnpm --filter @wingman/persistence test` — hydrate without presence revival + expire-on-boot  
`pnpm --filter @wingman/api test` — `restart.e2e.test.ts` simulates process restart
