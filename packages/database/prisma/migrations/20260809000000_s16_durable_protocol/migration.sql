-- S16: Durable protocol tables for deterministic boot hydration.
-- Presence / radar / sockets remain Redis-only (not stored here).

CREATE TABLE IF NOT EXISTS "ProtocolIdentity" (
    "id" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "interestedIn" "InterestTarget"[],
    "wingmanPlus" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProtocolIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProtocolSignalRow" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProtocolSignalRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProtocolSignalRow_isActive_expiresAt_idx"
  ON "ProtocolSignalRow"("isActive", "expiresAt");
CREATE INDEX IF NOT EXISTS "ProtocolSignalRow_pairKey_idx"
  ON "ProtocolSignalRow"("pairKey");

CREATE TABLE IF NOT EXISTS "ProtocolConnectionRow" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProtocolConnectionRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProtocolConnectionRow_isActive_expiresAt_idx"
  ON "ProtocolConnectionRow"("isActive", "expiresAt");
CREATE INDEX IF NOT EXISTS "ProtocolConnectionRow_pairKey_idx"
  ON "ProtocolConnectionRow"("pairKey");
CREATE INDEX IF NOT EXISTS "ProtocolConnectionRow_initiatorId_isActive_idx"
  ON "ProtocolConnectionRow"("initiatorId", "isActive");
CREATE INDEX IF NOT EXISTS "ProtocolConnectionRow_recipientId_isActive_idx"
  ON "ProtocolConnectionRow"("recipientId", "isActive");

CREATE TABLE IF NOT EXISTS "ProtocolBlockRow" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolBlockRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolBlockRow_blockerId_blockedId_key"
  ON "ProtocolBlockRow"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "ProtocolBlockRow_blockedId_idx"
  ON "ProtocolBlockRow"("blockedId");

CREATE TABLE IF NOT EXISTS "ProtocolReportRow" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolReportRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProtocolConsentRow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProtocolConsentRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProtocolConsentRow_userId_occurredAt_idx"
  ON "ProtocolConsentRow"("userId", "occurredAt");

CREATE TABLE IF NOT EXISTS "ProtocolSignalUsageRow" (
    "usageKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProtocolSignalUsageRow_pkey" PRIMARY KEY ("usageKey")
);
