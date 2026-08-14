# Wingman Live Field Test — S27–S34

**Status:** LOCKED 2026-08-14  
**Surface ready (UI):** `078d308` · https://wingman-prototype.vercel.app/  
**This track ≠** advanced-engine / learning sprints (still blocked until S26 Review).  
**This track =** productionize the **real multi-user protocol**.

## Phase change

```text
STOP  polishing the interface in a loop
STOP  treating “CI green + Vercel deployed” as Field Test Ready
START Live Field Test: real people, real phones, real numbers,
      shared session, durable DB, realtime, end-to-end proof
```

**Surface Field Test ready** = UI walkable on phones (demo/mock OK for polish review).  
**Wingman Field Test Ready** = the DoD below — no fake users, no QA buttons, no manual DB, no developer intervention.

## Protocol gate (non-negotiable)

```text
REAL USERS → REAL PHONES → REAL OTP → REAL RADAR → REAL SIGNAL
→ REAL SELFIE → REAL MUTUAL VALIDATION → REAL MISSION → REAL OUTCOME
```

## Engineering rules (immediate lock)

| Rule | Status |
|------|--------|
| No payments now (`PAYMENTS_ENABLED=false`) | LOCKED |
| No public Destiny in field test | LOCKED |
| No new intelligent engine / learning | LOCKED |
| No general redesign | LOCKED |
| Payment architecture may stay dormant | OK |
| **One active connection per person** (DB invariant, not UI-only) | LOCKED |
| `?qa=1` / Smoke / Offline Labs = **internal only** | LOCKED |
| No simulated “other user” that could be mistaken for a real person on the public field path | LOCKED |

## Sprint board

| Sprint | Focus | Gate |
|--------|-------|------|
| **S27** | Production Identity & Real Phone Auth | Two real phones, two real numbers → two independent accounts; reconnect after full app kill; OTP expiry/resend; rate limits; **dev auth impossible on public production** |
| **S28** | Production Persistence Certification | Users, profiles, Signals, Connections, durable state, entitlements survive Vercel redeploy/restart; Redis ephemeral; Postgres durable authority; no critical state in instance memory |
| **S29** | Real Multi-user Realtime | 2 → 5 → 10 phones; Signal A→B without manual refresh; accept/expire/selfie/validation/ticket/Mission/Cooldown synced; WS reconnect, bg/fg, slow net, Wi‑Fi↔cellular, brief offline; **no contradictory states** |
| **S30** | Real Radar & Geo Field Test | No simulated nearby users; coarse location + real presence + visibility; near/far/moving/offline/invisible/permission denied; **no precise coordinates exposed** |
| **S31** | Real Selfie Exchange | Real camera iOS/Android; permissions; direct capture; private opaque media; correct recipient only; expiry/delete; mid-exchange leave; refuse camera / bad net; **no public file / durable URL leak** |
| **S32** | Push & Closed-app Protocol | Signal/reply/expiry/ticket while app closed & locked; notification opens **correct protocol state** (not home) |
| **S33** | Safety & Field-test Controls | Real Block/Report; blocked user gone from protocol; server-enforced Signal limits; no raw phone/selfie/precise location in sensitive logs; kill-switch / feature flag without full redeploy; Destiny stays out of public test |
| **S34** | Live Field Test Certification | 5–10 testers, multi-day; measure OTP, Radar, Signal path, Mission completion, errors, disconnects, time-to-first-Signal, abandons, reports, per-device issues → **GO PILOT** / **FIX LIST CLOSED** / **NO-GO** — no redesign from impressions |

## Definition of Done — Wingman Field Test Ready

> Pape opens Wingman with a **real number** on phone A. Igor (or another tester) opens with a **real number** on phone B. Both exist as real accounts. A sends a Signal. B receives it **even with the app closed**. Both complete **real selfie exchange** and **mutual validation**, start **Mission Meet**, finish Mission, return to Radar — **without** fake users, manual DB edits, QA buttons, required refresh, or developer help.

Repeat on multiple devices. Only then is Wingman a **testable product**, not only a strong technical implementation.

## Lab vs product surface

- Ordinary testers: product only (no Smoke / Offline / fake peers).  
- Internal: `?qa=1` for labs.  
- Banner “Field test · demo” OK during controlled surface phase; any behavior that fakes another real user must be removed from the public field-test path before S34.

## Order

Execute **S27 → S34** in sequence unless a gate failure forces a closed fix list inside the same sprint. Do not open a redesign sprint. Do not enable payments or public Destiny.

## Related

- Surface UI guide: [`FIELD_TEST.md`](./FIELD_TEST.md)  
- Polish review (UI-only): [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md)  
- Payments dormant: [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md)  
- Board: [`PROJECT_STATE.md`](./PROJECT_STATE.md)
