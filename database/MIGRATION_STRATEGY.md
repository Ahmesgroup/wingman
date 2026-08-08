# Migration Strategy

**Status:** Decided · Related: `schema.prisma`, `DATABASE_INVARIANTS.md`

Prisma migrations plus hand-written SQL for constraints Prisma cannot express.

## Hand-written SQL (post prisma migrate)

```sql
-- Partial unique: one active Signal per pair
CREATE UNIQUE INDEX signal_active_pair ON "Signal"("pairKey") WHERE "isActive";

-- Partial unique: one active Connection per pair
CREATE UNIQUE INDEX connection_active_pair ON "Connection"("pairKey") WHERE "isActive";

-- Self-reference guards
ALTER TABLE "UserBlock" ADD CONSTRAINT block_not_self CHECK ("blockerId" <> "blockedId");
ALTER TABLE "Signal"    ADD CONSTRAINT signal_not_self CHECK ("senderId" <> "receiverId");
ALTER TABLE "Connection" ADD CONSTRAINT conn_roles_distinct CHECK ("initiatorId" <> "recipientId");

-- Time ordering
ALTER TABLE "Signal"     ADD CONSTRAINT signal_time_order CHECK ("expiresAt" > "createdAt");
ALTER TABLE "Connection" ADD CONSTRAINT conn_time_order   CHECK ("expiresAt" > "startedAt");
```

Rules: never delete a deployed migration; every schema change ships with a migration + test + doc update
(AI_CODING_RULES #12–13). Purges run in workers over `purgeAt` indexes.
