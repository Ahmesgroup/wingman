# Consent Model

**Status:** Decided (V4.1) · Related: `DATA_PROCESSING_PURPOSES.md`, `database/schema.prisma` (ConsentEvent), DECISION_LOG D-018

## Principles

Where consent is the legal basis it must be free, specific, informed, and unambiguous. Core service operation
relies on **contractual necessity**, not consent. A single global "data exchange" toggle is not acceptable.

## Per-purpose, append-only, versioned

`ConsentEvent` is append-only. Withdrawing then re-granting creates new rows; history is preserved.

Fields: `userId`, `purpose`, `action (GRANTED|WITHDRAWN)`, `policyVersion`, `policyHash`, `locale`, `source`,
`occurredAt`. Current status is derived from the latest event per purpose.

Purposes: `CORE_MATCHING` (contractual necessity — not a toggle), `COARSE_LOCATION`, `DESTINY_CONNECTION`,
`PUSH_NOTIFICATIONS`, `PRODUCT_ANALYTICS`.

## Minimization still applies

Consent does not remove the minimization duty, especially for location: coarse only, never persisted precisely.

## Deletion nuance

`onDelete: Cascade` on consent events would remove proof of consent. Whether some consent records must be retained
temporarily to demonstrate compliance or defend a right is a **legal decision**, documented in
`ACCOUNT_DELETION.md`, not silently encoded in the schema.
