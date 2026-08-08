# Domain Model

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Aggregates: **User/Profile**, **Signal**, **Connection** (root of the post-signal protocol, owning SelfieExchange,
Ticket, MissionMeet, Cooldown, Outcome), **Safety** (Block, Report, ModerationCase), **Billing** (Product, Purchase,
Subscription, Entitlement), **Destiny** (Preference, Candidate).

Value objects: PairKey (order-independent identity), Money (cents+currency), Window (absolute expiresAt), Mood,
Intention. Invariants live in the aggregate roots and are enforced atomically (see `DATABASE_INVARIANTS.md`).
