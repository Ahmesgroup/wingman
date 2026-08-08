# ADR-005 — Server-Authoritative Timers
**Status:** Accepted
**Context:** A paused timer could be exploited (hold a selfie offline, bypass the window).
**Decision:** Every timed state has an absolute server `expiresAt`. Clients render `expiresAt − serverTime`.
Offline never pauses. Short (30–60s) tolerance for action acceptance only. Warnings derived client-side.
**Consequences:** Consistent, abuse-resistant timing across Signal, selfie, Mission Meet, Ticket, Cooldown, Rematch.
