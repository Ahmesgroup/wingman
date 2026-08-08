# Database Overview

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

PostgreSQL is the durable store; Redis holds ephemeral state; selfies live in private encrypted object storage. The
schema (`schema.prisma`) covers identity/auth, profile reference data, per-purpose consent, entitlements/billing,
the connection protocol (metadata only — no media/chat/precise location), safety/moderation, and Destiny. All
guarantees are enumerated in `DATABASE_INVARIANTS.md`; retention in `DATA_RETENTION_MATRIX.md`; migrations in
`MIGRATION_STRATEGY.md`.
