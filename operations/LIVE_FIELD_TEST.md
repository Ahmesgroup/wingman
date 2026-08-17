# Wingman Live Field Test — S27–S34

**Status:** LOCKED 2026-08-14 · Protocol matrix refresh 2026-08-17  
**Surface:** https://wingman-prototype.vercel.app/  
**API:** https://wingman-api-three.vercel.app/  
**PRODUCT PROTOCOL READY:** **NO** — see [`PROTOCOL_READINESS.md`](./PROTOCOL_READINESS.md)  
**This track ≠** advanced-engine / learning sprints (still blocked until S26 Review).  
**This track =** productionize the **real multi-user protocol**.

### 2026-08-17 engineering note (honest)

- Wired: `POST /me/profile`, consent from client, Socket.IO client, `mission.message` + `GET /connections/:id/messages`, removed public dual-user peer impersonation.
- **S28 GO (infra):** Neon Postgres (`wingman-pg`) + Upstash Redis (`wingman-redis`) on `wingman-api` Production; Prisma migrations applied; public prod **fail-closed**; `/internal/ready` = prisma/redis/postgres; durability cert passed after redeploy. See [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md).
- Selfie media: **WIRED (infra)** — Vercel Blob private + camera upload path; Evidence Pack **NOT STARTED**.
- Two-phone Evidence Pack: **NOT STARTED / BLOCKED** (next human gate after S28 infra). [`EVIDENCE_PACK_TWO_PHONE.md`](./EVIDENCE_PACK_TWO_PHONE.md).

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
| **S27A** | Field-Test Identity | Real phones + real E.164 identities + Bearer sessions + allow-list + field-test OTP (**no SMS claim**); no `x-user-id` / fake users |
| **S27B** | Production SMS OTP | Real SMS provider (Twilio later); delivery / wrong / expired / resend / rate-limit on production domain |
| **S28** | Production Persistence Certification | Users, profiles, Signals, Connections, durable state, entitlements survive Vercel redeploy/restart; Redis ephemeral; Postgres durable authority; no critical state in instance memory |
| **S29** | Real Multi-user Realtime | 2 → 5 → 10 phones; Signal A→B without manual refresh; accept/expire/selfie/validation/ticket/Mission/Cooldown synced; WS reconnect, bg/fg, slow net, Wi‑Fi↔cellular, brief offline; **no contradictory states** |
| **S30** | Real Radar & Geo Field Test | No simulated nearby users; coarse location + real presence + visibility; near/far/moving/offline/invisible/permission denied; **no precise coordinates exposed** |
| **S31** | Real Selfie Exchange | Real camera iOS/Android; permissions; direct capture; private opaque media; correct recipient only; expiry/delete; mid-exchange leave; refuse camera / bad net; **no public file / durable URL leak** |
| **S32** | Push & Closed-app Protocol | Signal/reply/expiry/ticket while app closed & locked; notification opens **correct protocol state** (not home) |
| **S33** | Safety & Field-test Controls | Real Block/Report; blocked user gone from protocol; server-enforced Signal limits; no raw phone/selfie/precise location in sensitive logs; kill-switch / feature flag without full redeploy; Destiny stays out of public test |
| **S34** | Live Field Test Certification | 5–10 testers, multi-day; measure OTP, Radar, Signal path, Mission completion, errors, disconnects, time-to-first-Signal, abandons, reports, per-device issues → **GO PILOT** / **FIX LIST CLOSED** / **NO-GO** — no redesign from impressions |

## Definition of Done — Wingman Field Test Ready

> Pape opens Wingman with a **real number** on phone A. Igor (or another tester) opens with a **real number** on phone B. Both exist as real accounts. A sends a Signal. B receives it **even with the app closed**. Both complete **real selfie exchange** and **mutual validation**, start **Mission Meet**, finish Mission, return to Radar — **without** fake users, manual DB edits, QA buttons, required refresh, or developer help.

**Igor checklist (product only):** Open Wingman → enter your number → follow the app. No Nest URL, no `?api=`, no API knowledge required.

Repeat on multiple devices. Only then is Wingman a **testable product**, not only a strong technical implementation.

## Lab vs product surface

- Ordinary testers: product only (no Smoke / Offline / fake peers).  
- Internal: `?qa=1` for labs.  
- Banner “Field test · demo” OK during controlled surface phase; any behavior that fakes another real user must be removed from the public field-test path before S34.

## Certification chain (strict)

```text
S27A Field-test identity  →  (unlocks S28+)
S27B Production SMS OTP   →  (before public launch; parallel after S27A OK)
  → S28 persistence
  → S29 realtime multi-device
  → S30 radar réel
  → S31 selfie réel
  → S32 push app fermée
  → S33 safety
  → S34 Live Field Test Certification
```

**Rule:** no sprint is “done” because code compiles or CI is green.  
Each sprint must produce **real-device proof** that unlocks the next.  
**S28 does not start until S27A is green on physical phones.**  
S27B must not be marked GREEN without real SMS delivery.

`078d308` = surface ready to *begin* field work — **not** product proof.  
`46632b7` = method lock that stops polish-by-habit.

### Product DoD (blocks false positives)

> **Deux vrais numéros → Signal reçu app fermée → vrai selfie → validation → Mission → outcome → Radar**, sans fake user, sans `?qa=1`, sans édition manuelle DB, sans intervention développeur.

Invariant kept for the whole track: **1 active connection per person** (persistence / DB — not UI-only).

## S27A — Field-Test Identity (NEXT)

### Gate (physical devices)

| # | Proof |
|---|--------|
| 1 | Two physical phones, two **real** E.164 numbers (allow-listed) |
| 2 | **No** `x-user-id` / `AUTH_ALLOW_DEV` on public production |
| 3 | Field-test OTP (fixed coordinator code) — UI must **not** claim SMS sent |
| 4 | Two distinct identities created / resolved |
| 5 | Full app kill → reopen → sessions still correctly resolved |
| 6 | Wrong OTP rejected |
| 7 | Expired OTP rejected |
| 8 | Controlled resend works |
| 9 | Rate limit / anti-bruteforce observable |
| 10 | Non-allow-listed number rejected |
| 11 | Logout → login restores the same identity |

## S27B — Production SMS OTP (deferred)

Same identity protocol with real Twilio (or equivalent) delivery. Does **not** block S28 after S27A GREEN. Required before public launch claiming SMS verification.

### Levels of “green” (do not conflate)

| Level | Means | Does **not** mean |
|-------|--------|-------------------|
| **CI green** | Code is healthy (compile/tests) | Sprint or product proven |
| **S27A green** | Real-device identity proof with field-test OTP | SMS delivery proven |
| **S27B green** | Real SMS delivery proven | Full multi-human protocol |
| **S34 green** | Full protocol works across several humans without assistance | — |

A successful Vercel deploy alone **never** closes S27–S34.

### Binary exit (GREEN / OPEN / BLOCKED — no “almost”)

- **S27A GREEN** — field-test identity Evidence Pack complete; no developer bypass  
- **S27B GREEN** — real SMS Evidence Pack complete  
- **OPEN** — any single failure (CI green is irrelevant)  
- **BLOCKED** — external infra (Twilio) prevents **S27B**; not used to fake S27A  

**S28 does not start** until **S27A** is **GREEN**. No parallel S28.  

Template + scripts: [`S27_IDENTITY_OTP.md`](./S27_IDENTITY_OTP.md).

## Related

- Surface UI guide: [`FIELD_TEST.md`](./FIELD_TEST.md)  
- Polish review (UI-only): [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md)  
- Payments dormant: [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md)  
- Board: [`PROJECT_STATE.md`](./PROJECT_STATE.md)
