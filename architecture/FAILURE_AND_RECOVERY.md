# Failure & Recovery

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Timers are server-authoritative, so client crashes/offline don't corrupt state. On reconnect the client reconciles
from `state`+`expiresAt`. Worker jobs are idempotent and safe to re-run. If Redis loses a sensitive ephemeral key
(no persistence by policy), the affected session simply expires — never resurrected from disk. PostgreSQL is the
durable source of truth for protocol metadata. Partial failures (e.g., media upload succeeds, DB tx fails) are
reconciled by the orphan-media sweeper.
