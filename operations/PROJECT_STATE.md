# Project state — frozen 2026-08-18 · next gate = TWO-PHONE EVIDENCE PACK only

**Source of truth (this freeze):** this file · [`PROTOCOL_READINESS.md`](./PROTOCOL_READINESS.md) · [`EVIDENCE_PACK_TWO_PHONE.md`](./EVIDENCE_PACK_TWO_PHONE.md)  
**Active track:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md) — S27–S34 protocol productionization  
**Public URL only:** https://wingman-prototype.vercel.app/  
**PRODUCT PROTOCOL READY:** **NO**

```text
WINGMAN — PUBLIC PROTOCOL CERTIFICATION
S34 PUBLIC-PATH PREP
IMPLEMENTED : YES
DEPLOYED    : YES
COMMIT      : a3615bf  (S34; origin/master HEAD)
LIVE PROD   : a3615bf  (GitHub Production 2026-08-18T17:26:57Z;
                        Vercel Ready → wingman-prototype.vercel.app
                        and wingman-api-three.vercel.app)
INCLUDED ON LIVE TREE (ancestors, previously shipped — not later SHAs):
              f5292fa  S32 web background / fail-closed push
              f5822f9  S33 two-tap report/block
              e586dfc  S31 private selfie media
              c9421c6  S29 realtime Signal/Radar/chat
NO SHA AFTER a3615bf EXISTS ON origin/master (checked 2026-08-18).

PUBLIC URL ONLY     : READY
SERVER TICKET STATE : WIRED
SERVER COOLDOWN     : WIRED
HUMAN ANTI-CONTACT  : WIRED
OUTCOME UX           : WIRED

TWO-PHONE EVIDENCE PACK : NOT STARTED
PHONE A : PENDING
PHONE B : PENDING
END-TO-END PROTOCOL : PENDING
PRODUCT PROTOCOL READY : NO

NEXT GATE:
Two real phones.
Public production URL only: https://wingman-prototype.vercel.app/
No x-user-id. No synthetic peers. No developer intervention.
No DB manipulation. No hidden test path (?api= ?qa=1 ?livingMap=1).

Required proof (12 steps):
OTP → Profile → Radar → Signal → Selfie A → Selfie B → Mutual
→ Mission → Realtime chat → Outcome → Cooldown → Radar

PASS = complete protocol works beginning to end on BOTH phones
       using only the public product.
       Each step: UI correct AND server state correct AND other phone synced.
FAIL = record exact boundary: device, browser, step, expected, observed, timestamp.
Then fix ONLY the proven boundary and replay the same matrix from the start.

NO NEW PRODUCT FEATURE UNTIL FIRST TWO-PHONE VERDICT.
```

**Positioning:** **Social Interaction Facilitation Technology** · **Make the first acquaintance easy.** Wingman
facilitates the first real-world interaction between people who are already near each other — or who repeatedly cross
paths through Destiny Connection.

**S28:** [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md) — Neon + Upstash live; `/internal/ready` = prisma/redis/postgres; durability cert passed  
**S29:** [`S29_REALTIME.md`](./S29_REALTIME.md) — Signal/Radar/chat/block over existing WS; included on live `a3615bf`  
**S31:** [`S31_PRIVATE_SELFIE_MEDIA.md`](./S31_PRIVATE_SELFIE_MEDIA.md) — Vercel Blob private + camera→upload→opaque id + server `capturedAt`  
**S32:** [`S32_WEB_BACKGROUND.md`](./S32_WEB_BACKGROUND.md) — web hide/show restore; push **BLOCKED** (no VAPID/FCM)  
**S33:** [`S33_SAFETY.md`](./S33_SAFETY.md) — two-tap report/block on product path (appendix row, not the 12-step gate)  
**S34:** [`S34_CERTIFICATION_PREP.md`](./S34_CERTIFICATION_PREP.md) — public-surface hygiene + ticket remainingMs + anti-contact copy + own-outcome  
**Related:** [`S26_MEASUREMENT.md`](./S26_MEASUREMENT.md), [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md), [`FIELD_TEST.md`](./FIELD_TEST.md)

```text
S0–S20    Backend V1                FROZEN / GO
S21–S26   Advanced engines          DONE / baseline (learning OFF)
LEARNING                            OFF
MEASUREMENT                         ON
ENGINE / INTEL SPRINTS              STOPPED (no new engine)
NEXT (engines)                      S26 Review only — not automatic engine-S27
CLIENT UI P1–P4                     DONE (historical surface `078d308`)
CLIENT polish loop                  STOPPED — no redesign / polish-by-habit
PAYMENTS                            OFF (architecture dormant)
DESTINY (public field)              OUT until own gates
ACTIVE                              TWO-PHONE EVIDENCE PACK ONLY
S27A                                OPEN — Evidence Pack NOT STARTED
S27B                                OPEN — Twilio Verify configured; SMS evidence later
S27A verdict                        OPEN — never “almost”
S28                                 GO (infra)
S29                                 WIRED (realtime); Evidence Pack later
Gate C profile                      WIRED POST /me/profile — durable GO (infra)
S35 V2                              EXPERIMENT SPEC ONLY — flag false; no domain merge
S36–S43 native                      DEFERRED — entry after V1 Evidence Pack GREEN
```

## Live Field Test board (protocol — not engines)

```text
S27A Field-Test Identity                       OPEN (Evidence Pack NOT STARTED)
S27B Production SMS OTP                        OPEN (Twilio Verify; evidence later)
S28  Production Persistence Certification      GO (infra)
S29  Real Multi-user Realtime                  WIRED (realtime)
S30  Real Radar & Geo Field Test               WIRED (client) — geo + heartbeat; Evidence Pack later
S31  Real Selfie Exchange                      WIRED (infra) — Evidence Pack NOT STARTED
S32  Push & Closed-app Protocol                PARTIAL wire (web reconnect) / BLOCKED (push credentials)
S33  Safety & Field-test Controls              WIRED (product path) — appendix later
S34  Live Field Test Certification             WIRED (prep) — Evidence Pack NOT STARTED; READY = NO
S35  Product Protocol V2                       EXPERIMENT SPEC ONLY (flag false)
     → GO PILOT | FIX LIST CLOSED | NO-GO
```

## Product DoD (testers)

> Open https://wingman-prototype.vercel.app/ → enter your number → follow the app.  
> No Nest URL, no `?api=`, no `?qa=1`, no `?livingMap=1`, no fixed OTP in Twilio production mode, no `x-user-id` / seed / DB hacks.

Gate chain (required 12-step matrix):

```text
OTP → PROFILE → RADAR → SIGNAL → SELFIE A → SELFIE B
→ MUTUAL → MISSION → REALTIME CHAT → OUTCOME → COOLDOWN → RADAR
```

## Locks (immediate)

- **No new product feature until the first two-phone verdict**
- No payments now · no public Destiny · no new intelligent engine · no general redesign · no native
- One **active connection per person** enforced in persistence, not only UI
- Labs (`?qa=1`, Smoke, Offline) internal only
- No fake peer that can be mistaken for a real user on the public field path
- “CI green + Vercel” ≠ Field Test Ready
- Wingman does not help you collect matches. Wingman helps you make the first acquaintance.
- `PRODUCT_PROTOCOL_V2_ENABLED=false`; V2 cannot merge Selfie into Signal or become default Production.
- V3.1 is the owner-locked baseline; S35 and the Evidence Pack are separate evidence levels, not replacement product
  definitions.

## DoD — Wingman Field Test Ready

Two real phones, two real numbers, the 12-step matrix PASS on both, using only the public product — without fake users, QA buttons, manual DB, required refresh, or developer help. Details: [`EVIDENCE_PACK_TWO_PHONE.md`](./EVIDENCE_PACK_TWO_PHONE.md).

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
