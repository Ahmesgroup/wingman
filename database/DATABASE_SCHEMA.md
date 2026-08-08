# Database Schema (Narrative)

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

The authoritative schema is `schema.prisma`. Highlights (from the V4.1 review):

- Phone stored as `phoneLookupHash` (HMAC) + `phoneCiphertext` (AES-256-GCM) + `phoneKeyVersion`; no raw number.
- Age via `birthDate`; min age 18.
- `Signal` and `Connection` carry `pairKey` + `isActive` with **partial unique** indexes (one active per pair).
- Roles (`initiatorId`/`recipientId`) are separate from pair ordering (`pairLowId`/`pairHighId`).
- `ActiveUserLock` (PK = userId) guarantees one active connection per user.
- `MissionResponse` enum (PENDING/YES/NO/TIMEOUT); `metConfirmed` derived.
- `purgeAt` (not `deletedAt`) for retention; `endedAt` for actual end.
- `ConsentEvent` append-only, per purpose, versioned.
- `Entitlement` typed values, decoupled from Product/Purchase/PaymentTransaction/Subscription.
- Moderation evidence referenced, not inlined; every access audit-logged.
- Destiny candidates short-lived; raw proximity never stored.

Any change here requires a migration + test + this doc + a DECISION_LOG entry.
