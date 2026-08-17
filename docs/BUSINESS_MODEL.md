# Business Model

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Freemium with targeted one-time purchases; intentionally lean at launch.

**Free:** full Radar, 2 signals/day, 1 Ticket up to 2h, Pulse visible (no notifications), Mission Meet 15 min,
Destiny, Mood.

**Wingman+ — €9.99/mo:** 25 Signals/day, 2 Tickets up to 24h + 1 renewal, Verified Selfie Cache (24h), dot view
count, discovery priority (increases probability, never guarantees exposure), Pulse notifications, +5-min windows,
Mission Meet 20 min.

**One-time:** Night Pass €2.99, Event Pass €4.99, Verified Selfie €0.99, Rematch €1.99, Cool Down Skip €0.99.

Rights are modeled as **entitlements** (typed, time-boxed), decoupled from accounting (Product/Purchase/
PaymentTransaction/Subscription). No financial effect without an idempotency key.

**Never:** boosted profiles, ads in the meeting flow, monetizing behavioral data.
