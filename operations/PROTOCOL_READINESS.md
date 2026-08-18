# Protocol readiness — PRODUCT PROTOCOL READY

**Status:** **NO**  
**Updated:** 2026-08-18 (Living Map primary surface — owner override for this sprint only)  
**Public URL only:** https://wingman-prototype.vercel.app/  
**API (not a tester URL):** https://wingman-api-three.vercel.app/

Destiny OFF · Payments OFF · No fake public peers · No `x-user-id` on public prod.
**V3.1 positioning:** **Social Interaction Facilitation Technology** · **Make the first acquaintance easy.**

This file is a source of truth with [`PROJECT_STATE.md`](./PROJECT_STATE.md) and
[`EVIDENCE_PACK_TWO_PHONE.md`](./EVIDENCE_PACK_TWO_PHONE.md).

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

NO NEW PRODUCT FEATURE UNTIL FIRST TWO-PHONE VERDICT
(except Living Map as primary surface — owner override, this sprint only).
Evidence Pack remains NOT STARTED. PRODUCT PROTOCOL READY = NO.
```

## Locked status (honest)

**Three levels:** V3.1 is owner-locked product authority; S35 is a false-by-default experiment with no domain merge;
the Evidence Pack is the real-device proof level. Neither S35 nor infrastructure wiring can change the readiness
verdict.

| Area | Status |
|------|--------|
| S34 public-path prep | **IMPLEMENTED + DEPLOYED** (`a3615bf` live) |
| Protocol wiring | **WIRED** (not GREEN) |
| Production durability | **GO (infra)** — steps 1–5 complete |
| Private selfie media | **WIRED (infra)** — Evidence Pack still open |
| Two-phone Evidence Pack | **NOT STARTED** |
| Phone A / Phone B | **PENDING** |
| End-to-end protocol | **PENDING** |
| PRODUCT PROTOCOL READY | **NO** |

## Live Production probe (2026-08-17 post-S28; still true 2026-08-18)

| Check | Before | After |
|-------|--------|-------|
| `GET /internal/ready` | ephemeral=memory, persistence=memory, database=not-configured | **ephemeral=redis, persistence=prisma, database=postgres, ready=true** |
| Durability cert | n/a | identity+connection marker survived Production redeploy |

S28 detail: [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md).  
S31 detail: [`S31_PRIVATE_SELFIE_MEDIA.md`](./S31_PRIVATE_SELFIE_MEDIA.md).  
S32 detail: [`S32_WEB_BACKGROUND.md`](./S32_WEB_BACKGROUND.md) — web hide/show restore wired; push **BLOCKED** on VAPID/FCM credentials.

## Production smoke (2026-08-17 19:12 UTC)

Public, read-only probes returned the following. No credentials, OTP values, tokens, phone numbers, or user data were
used or recorded.

| Check | Result |
|-------|--------|
| Auth mode | **PASS** — `otpProvider=twilio_verify`, `fieldTest=false`, `authAllowDev=false`, `publicProd=true` |
| Readiness | **PASS** — `ready=true`; ephemeral=`redis`; persistence=`prisma`; database=`postgres`; media=`vercel_blob`; Destiny false |
| Living Map default | **ON (this sprint)** — public surface is Living Map; canvas Radar is rollback (`WINGMAN_LIVING_MAP_V1=false` or `?radar=canvas`). See [`S44_LIVING_MAP.md`](./S44_LIVING_MAP.md) |
| In-memory fallback | **PASS** — public-production boot tests refuse missing Redis, database, or private media configuration |
| Public demo leakage | **PASS (wire)** — public client fails visibly rather than silently entering mock mode; public production rejects developer headers; Living Map is the default surface, canvas Radar remains rollback |
| Two-session automated flow | **PASS (test harness only)** — not Evidence Pack; does not change READY |

This is production wiring and a local CI-style simulation, not an Evidence Pack row. Real SMS and two human phones are
still required. **PRODUCT PROTOCOL READY = NO.**

## Required 12-step matrix (Evidence Pack)

A-only screen success is **not** enough. Each step must be PASS on **UI**, **server state**, and **other phone synced**.

| # | Step | Wiring (code) | Two-phone evidence |
|---|------|---------------|--------------------|
| 1 | OTP | Twilio Verify on public prod | **NOT STARTED** |
| 2 | Profile | `POST /me/profile`; durable GO (infra) | **NOT STARTED** |
| 3 | Radar | geo + heartbeat; `radar.changed` | **NOT STARTED** |
| 4 | Signal | send as self; `signal.received` | **NOT STARTED** |
| 5 | Selfie A | camera → private Blob → opaque id | **NOT STARTED** |
| 6 | Selfie B | same, other phone | **NOT STARTED** |
| 7 | Mutual | `POST .../approve`; `validation.updated` | **NOT STARTED** |
| 8 | Mission | server `remainingMs` / ticket | **NOT STARTED** |
| 9 | Realtime chat | `mission.message`; human anti-contact | **NOT STARTED** |
| 10 | Outcome | own outcome only | **NOT STARTED** |
| 11 | Cooldown | server remaining; starts when both answered | **NOT STARTED** |
| 12 | Radar (return) | previous connection gone; Radar usable | **NOT STARTED** |

Optional appendix (not the gate): block, kill/reopen, location deny. See [`EVIDENCE_PACK_TWO_PHONE.md`](./EVIDENCE_PACK_TWO_PHONE.md).

## Protocol wiring matrix (not GREEN)

| Step | Frontend SoT | Backend | Store | Realtime | Survives refresh? | Demo leak? | Verdict |
|------|--------------|---------|-------|----------|-------------------|------------|---------|
| REAL OTP | `api.js` Bearer + device | `POST /auth/otp/*` Twilio Verify | Auth sessions | n/a | Session tokens in LS | No SMS claim when field-test; prod claims SMS via Twilio | **PASS wire** / Evidence Pack **NOT STARTED** |
| REAL PROFILE | `#profile-next-btn` → `POST /me/profile` | `GET/POST /me` | Engine + mirror (`ProtocolIdentity`) | none | **Durability GO (infra)** | Removed `data-go` skip | **PASS wire** / durable **GO (infra)** |
| REAL RADAR | `radarActivate` + geolocation + heartbeat + `candidatesToDots` | `/radar/*` | Presence ephemeral (Redis target) | `radar.changed` (appear/leave/block; heartbeat does not rebroadcast) | Heartbeat while tab foreground | Ghost dots removed | **PASS wire** / Evidence Pack NOT STARTED |
| REAL SIGNAL | send as self; receive via WS | `/signals` | Engine + mirror | `signal.received` | Durability IN PROGRESS | Sender no longer fakes incoming | **PASS wire** / Evidence Pack NOT STARTED |
| REAL SELFIE A/B | camera → private upload → opaque `mediaId` + server `capturedAt` | `POST .../media` + `POST .../selfie` + authorized `GET .../media/:id` | private Blob + Connection | `validation.updated` | Connection id | Peer impersonation gated to lab; camera denied blocking; slow net honest fail | **WIRED (infra)** / Evidence Pack **NOT STARTED** |
| REAL MUTUAL | approve as initiator | `POST .../approve` | Connection | `validation.updated` | if durable | — | **PASS wire** |
| REAL MISSION CHAT | `message` + WS + `GET .../messages` | messages + `mission.message` | Redis ephemeral target | `mission.message` | Durability IN PROGRESS | No fake chat states on product | **PASS wire** / durable IN PROGRESS |
| REAL MISSION MODE | meet-now / lets-meet / finish | connection transitions | Connection | `mission.updated` | if durable | — | **PASS wire** |
| REAL OUTCOME | own outcome only | `POST .../outcome` | Connection | `mission.updated` | if durable | Peer sim lab-only | **PASS wire** |
| REAL BLOCK / REPORT | Radar / Discover / Signal / Selfie / Mission / Me → Safety → category | `POST /safety/report` + `POST /safety/block` | Engine + mirror | `connection.closed` + `radar.changed` | block durable | Admin preview hidden on public field-test | **PASS wire** / appendix **NOT STARTED** |
| REAL COOLDOWN → RADAR | cooldown UI + deactivate/activate | connection + presence | Presence ephemeral | — | presence no | — | **PASS wire** |

## Gate A / B / C

| Gate | Status |
|------|--------|
| **A** Radar ghosts / alone → nearby=0 | **PASS** (code + unit tests). Two-phone still **NOT STARTED**. |
| **B** Profile/consent CTA vs keyboard | Desktop OK; form-footer `--vv-offset`. Evidence Pack later. |
| **C** Real profile save | **WIRED**. Durable **GO (infra)** after S28 cert. |

## S27–S34 honesty

| Sprint | Status |
|--------|--------|
| S27A | **OPEN** — Evidence Pack **NOT STARTED** (waiting for two human phones) |
| S27B | **OPEN** — Twilio configured; SMS evidence later |
| S28 | **GO (infra)** — Neon + Upstash; fail-closed; ready=prisma/redis/postgres; durability cert passed |
| S29 | **WIRED (realtime)** — on live `a3615bf` via `c9421c6`; Evidence Pack later |
| S30 | **WIRED (client)** — browser geolocation (fail closed) + `/radar/heartbeat` while tab foreground; Evidence Pack later |
| S31 | **WIRED (infra)** — on live `a3615bf` via `e586dfc`; Evidence Pack NOT STARTED |
| S32 | **PARTIAL wire (web)** — on live `a3615bf` via `f5292fa`; push **BLOCKED**. See [`S32_WEB_BACKGROUND.md`](./S32_WEB_BACKGROUND.md) |
| S33 | **WIRED (product path)** — on live `a3615bf` via `f5822f9`; appendix later. See [`S33_SAFETY.md`](./S33_SAFETY.md) |
| S34 | **WIRED (prep) + DEPLOYED** — `a3615bf` live. Evidence Pack **NOT STARTED**. See [`S34_CERTIFICATION_PREP.md`](./S34_CERTIFICATION_PREP.md) |
| S35 V2 | **EXPERIMENT SPEC ONLY** — `PRODUCT_PROTOCOL_V2_ENABLED=false`; no engine merge |

## PRODUCT PROTOCOL READY

**= NO**

Two-phone Evidence Pack remains **NOT STARTED**. Wiring and a live S34 deploy do not fill a PASS row.

V2 is documented separately in [`S35_PRODUCT_PROTOCOL_V2.md`](./S35_PRODUCT_PROTOCOL_V2.md). It cannot change this readiness verdict or become default Production before its own A/B gate and the V1 Evidence Pack.
