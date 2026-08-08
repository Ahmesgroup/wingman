-- Hand-written invariants (see database/DATABASE_INVARIANTS.md)
-- Applied after Prisma migrate in production.

-- UNIQUE active signal per pair
-- CREATE UNIQUE INDEX signal_pair_active_uq ON "Signal" ("pairKey") WHERE "isActive";

-- UNIQUE active connection per pair
-- CREATE UNIQUE INDEX connection_pair_active_uq ON "Connection" ("pairKey") WHERE "isActive";

-- CHECK initiator <> recipient
-- ALTER TABLE "Connection" ADD CONSTRAINT connection_not_self CHECK ("initiatorId" <> "recipientId");
-- ALTER TABLE "Signal" ADD CONSTRAINT signal_not_self CHECK ("senderId" <> "receiverId");

SELECT 1;
