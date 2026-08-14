# Project state — locked 2026-08-11 · Live Field Test track 2026-08-14

**Reference commit (engines / baseline):** `ccbb7a3`  
**Client UI surface:** `078d308` · https://wingman-prototype.vercel.app/  
**Active track:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md) — S27–S34 protocol productionization  
**Related:** [`S26_MEASUREMENT.md`](./S26_MEASUREMENT.md), [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md), [`FIELD_TEST.md`](./FIELD_TEST.md)

```text
S0–S20    Backend V1                FROZEN / GO
S21–S26   Advanced engines          DONE / baseline (learning OFF)
LEARNING                            OFF
MEASUREMENT                         ON
ENGINE / INTEL SPRINTS              STOPPED (no new engine; not this S27)
NEXT (engines)                      S26 Review only — not automatic engine-S27

CLIENT UI P1–P4                     DONE (`078d308` surface field-test)
CLIENT polish loop                  STOPPED — no redesign / polish-by-habit
PAYMENTS                            OFF (architecture dormant)
DESTINY (public field)              OUT until own gates
ACTIVE                              LIVE FIELD TEST — S27 NEXT (phone proof required)
S27 gate                            2 phones · 2 real OTP · no x-user-id · kill/reopen session
S28+                                BLOCKED until S27 green on device
```

## Live Field Test board (protocol — not engines)

```text
S27  Production Identity & Real Phone Auth     NEXT
S28  Production Persistence Certification      QUEUED
S29  Real Multi-user Realtime                  QUEUED
S30  Real Radar & Geo Field Test               QUEUED
S31  Real Selfie Exchange                      QUEUED
S32  Push & Closed-app Protocol                QUEUED
S33  Safety & Field-test Controls              QUEUED
S34  Live Field Test Certification             QUEUED
     → GO PILOT | FIX LIST CLOSED | NO-GO
```

Gate chain:

```text
REAL USERS → REAL PHONES → REAL OTP → REAL RADAR → REAL SIGNAL
→ REAL SELFIE → REAL MUTUAL VALIDATION → REAL MISSION → REAL OUTCOME
```

## Locks (immediate)

- No payments now · no public Destiny · no new intelligent engine · no general redesign  
- One **active connection per person** enforced in persistence, not only UI  
- Labs (`?qa=1`, Smoke, Offline) internal only  
- No fake peer that can be mistaken for a real user on the public field path  
- “CI green + Vercel” ≠ Field Test Ready  

## DoD — Wingman Field Test Ready

Two real phones, two real numbers, Signal with app closed on B, real selfie + mutual validation, Mission Meet → Outcome → Radar — without fake users, QA buttons, manual DB, required refresh, or developer help. Details: [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md).

## Client / payments (unchanged intent)

- S19 = only entitlement authority  
- `DisabledPaymentProvider` / `PAYMENTS_ENABLED=false`  
- Surface UI guide: [`FIELD_TEST.md`](./FIELD_TEST.md)  
- Polish review (UI-only residual): [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md) — does not replace Live Field Test  

## Operating mode now

| Flag | Value | Meaning |
|------|-------|---------|
| `MEASUREMENT_ENABLED` | `true` | Observe; do not learn |
| `MEASUREMENT_LEARNING_ENABLED` | `false` | Forbidden until after S26 Review |
| `PAYMENTS_ENABLED` | `false` | No checkout |
| `AUTH_ALLOW_DEV` | local/dev only | Must be off on public production (S27) |
