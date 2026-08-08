# Database Invariants

**Status:** Decided (V4.1) · Related: `schema.prisma`, `MIGRATION_STRATEGY.md`, `architecture/STATE_MACHINES.md`

Invariants the data layer must guarantee. Where Prisma cannot express a constraint, it is created in a
hand-written migration (marked **migration**). Where it needs a transaction or lock, that is noted.

## Identity & pairs

| # | Invariant | Mechanism |
|---|---|---|
| I-1 | A user cannot block themselves | `CHECK (blockerId <> blockedId)` **migration** |
| I-2 | A user cannot signal themselves | domain guard + `CHECK (senderId <> receiverId)` **migration** |
| I-3 | Phone uniqueness without storing the number | `phoneLookupHash @unique` (HMAC) |
| I-4 | Pair identity is order-independent | `pairKey = min(id):max(id)`; `pairLowId`/`pairHighId` computed in domain |
| I-5 | Roles are not derived from ordering | separate `initiatorId`/`recipientId` columns |

## Signals

| # | Invariant | Mechanism |
|---|---|---|
| I-6 | At most one **active** Signal per pair | `UNIQUE(pairKey) WHERE isActive` **migration** |
| I-7 | Historical Signals are preserved | `isActive=false` on terminal states (never deleted early) |
| I-8 | `expiresAt > createdAt` | `CHECK` **migration** |
| I-9 | No Signal to/from a blocked user | domain guard evaluated before insert (checks `UserBlock` both directions) |

## Connections & locks

| # | Invariant | Mechanism |
|---|---|---|
| I-10 | At most one **active** Connection per pair | `UNIQUE(pairKey) WHERE isActive` **migration** |
| I-11 | History of connections per pair allowed | partial index only constrains active rows |
| I-12 | **At most one active Connection per user** | `ActiveUserLock.userId` is PK; both locks inserted in the same tx as the Connection; a second insert fails |
| I-13 | `initiatorId <> recipientId` | `CHECK` **migration** + domain guard |
| I-14 | `expiresAt > startedAt` | `CHECK` **migration** |
| I-15 | Terminal state releases locks | domain transition deletes both `ActiveUserLock` rows atomically |

### Creating a connection (atomic)

```ts
await prisma.$transaction(async (tx) => {
  const c = await tx.connection.create({ data });               // partial-unique guards pair
  await tx.activeUserLock.createMany({                          // PK guards per-user
    data: [
      { userId: initiatorId, connectionId: c.id, expiresAt },
      { userId: recipientId, connectionId: c.id, expiresAt },
    ],
  });                                                            // throws if either user already locked
});
```

## Outcomes, cooldown, retention

| # | Invariant | Mechanism |
|---|---|---|
| I-16 | Mission responses use an enum | `MissionResponse { PENDING, YES, NO, TIMEOUT }` |
| I-17 | `metConfirmed` never drifts | derived in the same tx that records the second response |
| I-18 | Cooldown length is a function of responses | domain: 30 min if ≥1 YES, else 15 min |
| I-19 | `purgeAt` is distinct from `endedAt` | separate columns; worker deletes `WHERE purgeAt <= now()` |
| I-20 | No media/chat/precise location in Postgres | schema has no such columns; enforced by review + tests |

## Entitlements & billing

| # | Invariant | Mechanism |
|---|---|---|
| I-21 | Entitlement values are typed | `integerValue`/`booleanValue`/`durationSec`, not strings |
| I-22 | `isActive` for an entitlement is derived, not stored | computed: `startsAt<=now AND (endsAt IS NULL OR endsAt>now) AND revokedAt IS NULL` |
| I-23 | No financial effect without idempotency | `Purchase.idempotencyKey @unique`; `PaymentTransaction.providerRef @unique` |
| I-24 | Rights are separate from payments | `Entitlement` vs `Product/Purchase/PaymentTransaction/Subscription` |

## Consent & privacy

| # | Invariant | Mechanism |
|---|---|---|
| I-25 | Consent history is append-only | `ConsentEvent` rows are never updated in place |
| I-26 | Consent is per purpose + versioned | `purpose`, `policyVersion`, `policyHash`, `locale`, `source` |
| I-27 | Deletion retention policy is a legal decision | documented in `privacy/ACCOUNT_DELETION.md`, not silently cascaded |

## Moderation

| # | Invariant | Mechanism |
|---|---|---|
| I-28 | Evidence bytes are not in Postgres | `ModerationEvidence` stores object key + key ref + hash + `purgeAt` |
| I-29 | Every evidence access is logged | `ModerationAuditLog` (actor, action, reason, time) |
| I-30 | Reports keep a controlled category | `ReportCategory` enum + optional free-text |

## Destiny

| # | Invariant | Mechanism |
|---|---|---|
| I-31 | Destiny off by default | `DestinyPreference.enabled = false` |
| I-32 | Candidates are short-lived | `DestinyCandidate.purgeAt` (e.g. 48h sliding); raw proximity events never stored |
| I-33 | Blocks evaluated before counting/prompting | domain guard |
