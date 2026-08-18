# Protocol readiness — PRODUCT PROTOCOL READY

**Status:** **NO**  
**Updated:** 2026-08-18  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/

Destiny OFF · Payments OFF · No fake public peers · No `x-user-id` on public prod.
**V3.1 positioning:** **Social Interaction Facilitation Technology** · **Make the first acquaintance easy.** Wingman
facilitates the first real-world interaction between people who are already near each other — or who repeatedly cross
paths through Destiny Connection.

## Locked status (honest)

**Three levels:** V3.1 is owner-locked product authority; S35 is a false-by-default experiment with no domain merge;
the Evidence Pack is the real-device proof level. Neither S35 nor infrastructure wiring can change the readiness
verdict.

| Area | Status |
|------|--------|
| Protocol wiring | **improved** |
| Production durability | **GO (infra)** — steps 1–5 complete |
| Private selfie media | **WIRED (infra)** — Evidence Pack still open |
| Two-phone Evidence Pack | **NOT STARTED / human-phone blocked** |
| PRODUCT PROTOCOL READY | **NO** |

## Live Production probe (2026-08-17 post-S28)

| Check | Before | After |
|-------|--------|-------|
| `GET /internal/ready` | ephemeral=memory, persistence=memory, database=not-configured | **ephemeral=redis, persistence=prisma, database=postgres, ready=true** |
| Durability cert | n/a | identity+connection marker survived Production redeploy |

S28 detail: [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md).  
S31 detail: [`S31_PRIVATE_SELFIE_MEDIA.md`](./S31_PRIVATE_SELFIE_MEDIA.md) — Vercel Blob private + camera upload path + server `capturedAt`.  
S32 detail: [`S32_WEB_BACKGROUND.md`](./S32_WEB_BACKGROUND.md) — web hide/show restore wired; push **BLOCKED** on VAPID/FCM credentials.

## Production smoke (2026-08-17 19:12 UTC)

Public, read-only probes returned the following. No credentials, OTP values, tokens, phone numbers, or user data were
used or recorded.

| Check | Result |
|-------|--------|
| Auth mode | **PASS** — `otpProvider=twilio_verify`, `fieldTest=false`, `authAllowDev=false`, `publicProd=true` |
| Readiness | **PASS** — `ready=true`; ephemeral=`redis`; persistence=`prisma`; database=`postgres`; media=`vercel_blob`; Destiny false |
| Living Map default | **PASS (wire)** — `/internal/live` `livingMap=false`; public `config.js` `livingMap=false`; HTML default is `#radar-canvas` with `#living-map-root` hidden |
| In-memory fallback | **PASS** — public-production boot tests refuse missing Redis, database, or private media configuration |
| Public demo leakage | **PASS (wire)** — public client fails visibly rather than silently entering mock mode; public production rejects developer headers; default Radar is canvas, not Living Map |
| Two-session automated flow | **PASS (test harness only)** — session-authenticated clients completed Radar-alone=0 → mutual 1/1 → disappear/reconnect → Signal → private selfie (third user 404) → Mission chat both ways → reconnect history → outcomes → cooldown; separate harness block/report removes the pair from Radar |

This is production wiring and a local CI-style simulation, not an Evidence Pack row. Real SMS and two human phones are
still required. **PRODUCT PROTOCOL READY = NO.**

## Protocol readiness matrix

| Step | Frontend SoT | Backend | Store | Realtime | Survives refresh? | Demo leak? | Verdict |
|------|--------------|---------|-------|----------|-------------------|------------|---------|
| REAL OTP | `api.js` Bearer + device | `POST /auth/otp/*` Twilio Verify | Auth sessions | n/a | Session tokens in LS | No SMS claim when field-test; prod claims SMS via Twilio | **PASS wire** / Evidence Pack **NOT STARTED** |
| REAL PROFILE | `#profile-next-btn` → `POST /me/profile` | `GET/POST /me` | Engine + mirror (`ProtocolIdentity`) | none | **Durability GO (infra)** | Removed `data-go` skip | **PASS wire** / durable **GO (infra)** |
| REAL RADAR | `radarActivate` + geolocation + heartbeat + `candidatesToDots` | `/radar/*` | Presence ephemeral (Redis target) | `radar.changed` (appear/leave/block; heartbeat does not rebroadcast) | Heartbeat while tab foreground | Ghost dots removed | **PASS wire** / Evidence Pack NOT STARTED |
| REAL SIGNAL | send as self; receive via WS | `/signals` | Engine + mirror | `signal.received` | Durability IN PROGRESS | Sender no longer fakes incoming | **PASS wire** / Evidence Pack NOT STARTED |
| REAL SELFIE A/B | camera → private upload → opaque `mediaId` + server `capturedAt` | `POST .../media` + `POST .../selfie` + authorized `GET .../media/:id` (authz, wrong connection, expired, third party) | private Blob + Connection | `validation.updated` | Connection id | Peer impersonation gated to lab; camera denied blocking; slow net honest fail | **WIRED (infra)** / Evidence Pack **NOT STARTED** |
| REAL MUTUAL | approve as initiator | `POST .../approve` | Connection | `validation.updated` | if durable | — | **PASS wire** |
| REAL MISSION CHAT | `message` + WS + `GET .../messages` | messages + `mission.message` | Redis ephemeral target | `mission.message` | Durability IN PROGRESS | No fake chat states on product | **PASS wire** / durable IN PROGRESS |
| REAL MISSION MODE | meet-now / lets-meet / finish | connection transitions | Connection | `mission.updated` | if durable | — | **PASS wire** |
| REAL OUTCOME | own outcome only | `POST .../outcome` | Connection | `mission.updated` | if durable | Peer sim lab-only | **PASS wire** |
| REAL BLOCK / REPORT | Radar / Discover / Signal / Selfie / Mission / Me → Safety → category | `POST /safety/report` + `POST /safety/block` | Engine + mirror | `connection.closed` + `radar.changed` | block durable | Admin preview hidden on public field-test | **PASS wire** / Evidence Pack **NOT STARTED** |
| REAL COOLDOWN → RADAR | cooldown UI + deactivate/activate | connection + presence | Presence ephemeral | — | presence no | — | **PASS wire** |

## Gate A / B / C

| Gate | Status |
|------|--------|
| **A** Radar ghosts / alone → nearby=0 | **PASS** (code + unit tests). |
| **B** Profile/consent CTA vs keyboard | Desktop OK; form-footer `--vv-offset`. Evidence Pack later. |
| **C** Real profile save | **WIRED**. Durable **GO (infra)** after S28 cert. |

## S27–S34 honesty

| Sprint | Status |
|--------|--------|
| S27A | **OPEN** — Evidence Pack **NOT STARTED** (waiting for two human phones) |
| S27B | **OPEN** — Twilio configured; SMS evidence later |
| S28 | **GO (infra)** — Neon + Upstash; fail-closed; ready=prisma/redis/postgres; durability cert passed |
| S29 | **WIRED (realtime)** — Signal/`radar.changed`/chat/block without refresh; multi-phone Evidence Pack later |
| S30 | **WIRED (client)** — browser geolocation (fail closed) + `/radar/heartbeat` while tab foreground; Evidence Pack later |
| S31 | **WIRED (infra)** — `@wingman/media` + Vercel Blob private; server `capturedAt`; authz tests; Evidence Pack NOT STARTED |
| S32 | **PARTIAL wire (web)** — reconnect/restore; push **BLOCKED** on VAPID/FCM credentials. See [`S32_WEB_BACKGROUND.md`](./S32_WEB_BACKGROUND.md) |
| S33 | **WIRED (product path)** — two-tap report/block from Radar, Discover, Signal, Selfie/ticket, Mission Meet, Me → Safety; server-enforced; Evidence Pack row 19 later. See [`S33_SAFETY.md`](./S33_SAFETY.md) |
| S34 | **WIRED (prep)** — public-surface hygiene + server ticket/cooldown remaining + human anti-contact + own-outcome. Live cohort / Evidence Pack **OPEN**. See [`S34_CERTIFICATION_PREP.md`](./S34_CERTIFICATION_PREP.md) |
| S35 V2 | **EXPERIMENT SPEC ONLY** — `PRODUCT_PROTOCOL_V2_ENABLED=false`; no engine merge |

## PRODUCT PROTOCOL READY

**= NO**

Two-phone Evidence Pack remains **NOT STARTED** (human phones required). Private selfie media is **WIRED (infra)** but not GREEN until field evidence. Report & block is posted from Radar, Discover, Signal, Selfie/ticket, Mission Meet, and Me → Safety; that does not fill Evidence Pack row 19.

V2 is documented separately in [`S35_PRODUCT_PROTOCOL_V2.md`](./S35_PRODUCT_PROTOCOL_V2.md). It cannot change this readiness verdict or become default Production before its own A/B gate and the V1 Evidence Pack.
