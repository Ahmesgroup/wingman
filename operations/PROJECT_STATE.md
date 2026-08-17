# Project state — locked 2026-08-11 · Live Field Test track 2026-08-14

**Reference commit (engines / baseline):** `ccbb7a3`  
**Client UI surface:** `078d308` · https://wingman-prototype.vercel.app/  
**Active track:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md) — S27–S34 protocol productionization  
**Protocol matrix:** [`PROTOCOL_READINESS.md`](./PROTOCOL_READINESS.md) · Evidence: [`EVIDENCE_PACK_TWO_PHONE.md`](./EVIDENCE_PACK_TWO_PHONE.md)  
**PRODUCT PROTOCOL READY:** **NO** (2026-08-17)  
**Locked status:** Protocol wiring **improved** · Production durability **GO (infra)** · Private selfie media **WIRED (infra)** · Two-phone Evidence Pack **NOT STARTED / BLOCKED**  
**Positioning:** **Social Interaction Facilitation Technology** · **Make the first acquaintance easy.** Wingman
facilitates the first real-world interaction between people who are already near each other — or who repeatedly cross
paths through Destiny Connection.
**S28:** [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md) — Neon + Upstash live; `/internal/ready` = prisma/redis/postgres; durability cert passed  
**S31:** [`S31_PRIVATE_SELFIE_MEDIA.md`](./S31_PRIVATE_SELFIE_MEDIA.md) — Vercel Blob private + camera→upload→opaque id; Evidence Pack still open  
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
ACTIVE                              LIVE FIELD TEST — product path = public site only
S27A                                OPEN — Evidence Pack NOT STARTED
S27B                                OPEN — Twilio Verify configured; SMS evidence later
S27A verdict                        OPEN — never “almost”
S28                                 GO (infra) — Neon+Upstash; fail-closed; durability cert passed
S29                                 PARTIAL wire (WS + Redis live); multi-phone later
Gate C profile                      WIRED POST /me/profile — durable GO (infra)
S35 V2                              EXPERIMENT SPEC ONLY — flag false; no domain merge
S36–S43 native                      DEFERRED — entry after V1 Evidence Pack GREEN
```

## Live Field Test board (protocol — not engines)

```text
S27A Field-Test Identity                       OPEN (Evidence Pack NOT STARTED)
S27B Production SMS OTP                        OPEN (Twilio Verify; evidence later)
S28  Production Persistence Certification      GO (infra)
S29  Real Multi-user Realtime                  PARTIAL wire
S30  Real Radar & Geo Field Test               PARTIAL (alone=0; hardcode geo remains)
S31  Real Selfie Exchange                      WIRED (infra) — Evidence Pack NOT STARTED
S32  Push & Closed-app Protocol                QUEUED
S33  Safety & Field-test Controls              PARTIAL wire (report/block API from Mission Meet)
S34  Live Field Test Certification             QUEUED
S35  Product Protocol V2                       EXPERIMENT SPEC ONLY (flag false)
     → GO PILOT | FIX LIST CLOSED | NO-GO
```

## Product DoD (testers)

> Open https://wingman-prototype.vercel.app/ → enter your number → follow the app.  
> No Nest URL, no `?api=`, no `?qa=1`, no fixed OTP in Twilio production mode, no `x-user-id` / seed / DB hacks.

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
- Wingman does not help you collect matches. Wingman helps you make the first acquaintance.
- `PRODUCT_PROTOCOL_V2_ENABLED=false`; V2 cannot merge Selfie into Signal or become default Production.
- V3.1 is the owner-locked baseline; S35 and the Evidence Pack are separate evidence levels, not replacement product
  definitions.

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
| `WINGMAN_API_URL` | prototype Vercel | Bakes API origin into public client (`config.js`); testers never set |
| `PRODUCT_PROTOCOL_V2_ENABLED` | `false` | S35 experiment only; no Production-default V2 |

## Deferred native track

[`S36_S43_NATIVE_ROADMAP.md`](./S36_S43_NATIVE_ROADMAP.md) documents native sequencing only. No Expo project is authorized this sprint; V1 web Evidence Pack GREEN with two real users is the hard entry gate.
