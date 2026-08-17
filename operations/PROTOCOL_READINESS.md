# Protocol readiness — PRODUCT PROTOCOL READY

**Status:** **NO** (two-phone Evidence Pack incomplete)  
**Updated:** 2026-08-17  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/

Destiny OFF · Payments OFF · No fake public peers · No `x-user-id` on public prod.

## Live Production probe (2026-08-17)

| Check | Observed |
|-------|----------|
| `GET /auth/mode` | `fieldTest:false`, `authAllowDev:false`, `otpProvider:twilio_verify`, `publicProd:true` |
| `GET /health` | `ok`, `destinyEnabled:false` |
| `GET /internal/ready` | **ephemeral=memory**, **persistence=memory**, **database=not-configured** |
| Prototype `config.js` | `apiUrl=https://wingman-api-three.vercel.app` |

## Protocol readiness matrix

| Step | Frontend SoT | Backend | Store | Realtime | Survives refresh? | Demo leak? | Verdict |
|------|--------------|---------|-------|----------|-------------------|------------|---------|
| REAL OTP | `api.js` Bearer + device | `POST /auth/otp/*` Twilio Verify | Auth sessions (in-proc on current prod) | n/a | Session tokens in LS | No SMS claim when field-test; prod claims SMS via Twilio | **PASS wire** / **OPEN** two-phone SMS evidence |
| REAL PROFILE | `#profile-next-btn` → `POST /me/profile` | `GET/POST /me` | Engine + mirror (`ProtocolIdentity` when DB set) | none | **FAIL on current prod** (memory, no DATABASE_URL) | Removed `data-go` skip | **PASS wire** / **BLOCKED durable** until Postgres |
| REAL RADAR | `radarActivate` + `candidatesToDots` | `/radar/*` | Presence ephemeral | `radar.changed` (client listens) | Must re-activate | Ghost dots removed | **PASS alone=0** / geo hardcode lat-lng lab coords |
| REAL SIGNAL | send as self; receive via WS | `/signals` | Engine + mirror | `signal.received` | Signal id in LS + WS resume | Sender no longer fakes incoming | **PASS wire** / two-phone OPEN |
| REAL SELFIE A/B | own opaque `mediaId` only | `POST .../selfie` | Connection state only | `validation.updated` | Connection id | Peer impersonation gated to lab | **BLOCKED media** (no private upload/purge) |
| REAL MUTUAL | approve as initiator | `POST .../approve` | Connection | `validation.updated` | yes if durable | — | **PASS wire** |
| REAL MISSION CHAT | `message` + WS + `GET .../messages` | messages + `mission.message` | In-memory messages | `mission.message` | **FAIL durable** on memory prod | No fake chat states on product | **PASS wire** / durable BLOCKED |
| REAL MISSION MODE | meet-now / lets-meet / finish | connection transitions | Connection | `mission.updated` | if durable | — | **PASS wire** |
| REAL OUTCOME | own outcome only | `POST .../outcome` | Connection | `mission.updated` | if durable | Peer sim lab-only | **PASS wire** |
| REAL COOLDOWN → RADAR | cooldown UI + deactivate/activate | connection + presence | Presence ephemeral | — | presence no | — | **PASS wire** |

## Gate A / B / C

| Gate | Status |
|------|--------|
| **A** Radar ghosts / alone → nearby=0 | **PASS** (code + unit tests). Live alone reconfirm on phone still useful. |
| **B** Profile/consent CTA vs keyboard | Desktop previously OK; form-footer now includes `--vv-offset`. **Await Android Evidence Pack**. |
| **C** Real profile save | **WIRED** (`POST /me/profile`). **Not GREEN durable** while Production `database=not-configured`. |

## S27–S34 honesty

| Sprint | Status |
|--------|--------|
| S27A | **OPEN** — need two-phone field-test Evidence Pack (prod is Twilio, not field-test OTP) |
| S27B | **OPEN** — Twilio configured; real SMS delivery Evidence Pack pending |
| S28 | **BLOCKED** — Production persistence is memory / DB not configured |
| S29 | **PARTIAL wire** — WS client + `mission.message`; multi-phone proof pending; Redis not on prod |
| S30 | **PARTIAL** — real candidates only; hardcoded Luxembourg coords in prototype activate |
| S31 | **BLOCKED** — no private media storage / camera pipeline / peer-only fetch |
| S32–S34 | **QUEUED / BLOCKED** upstream |

## PRODUCT PROTOCOL READY

**= NO**

Remaining human blockers: two real phones + SMS OTP proof, `DATABASE_URL` + Redis on API Production, private selfie media service, real device geo, closed-app push.

## Evidence Pack (Igor / two phones)

See checklist below — do **not** mark PRODUCT PROTOCOL READY until every row is PASS without developer help.
