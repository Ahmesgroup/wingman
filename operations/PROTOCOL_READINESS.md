# Protocol readiness — PRODUCT PROTOCOL READY

**Status:** **NO**  
**Updated:** 2026-08-17  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/

Destiny OFF · Payments OFF · No fake public peers · No `x-user-id` on public prod.

## Locked status (honest)

| Area | Status |
|------|--------|
| Protocol wiring | **improved** |
| Production durability | **BLOCKED / IN PROGRESS** |
| Private selfie media | **OPEN** |
| Two-phone Evidence Pack | **NOT STARTED / BLOCKED** (do not start until durability proven) |
| PRODUCT PROTOCOL READY | **NO** |

## Live Production probe

| Check | Before (memory era) | After provision + migrate (pre/post redeploy — update after deploy) |
|-------|---------------------|---------------------------------------------------------------------|
| `GET /auth/mode` | `fieldTest:false`, `authAllowDev:false`, `otpProvider:twilio_verify`, `publicProd:true` | same expected |
| `GET /health` | `ok`, `destinyEnabled:false` | same expected |
| `GET /internal/ready` | ephemeral=memory, persistence=memory, database=not-configured | **target:** ephemeral=redis, persistence=prisma, database=postgres |
| Prototype `config.js` | `apiUrl=https://wingman-api-three.vercel.app` | unchanged |

S28 detail: [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md).

## Protocol readiness matrix

| Step | Frontend SoT | Backend | Store | Realtime | Survives refresh? | Demo leak? | Verdict |
|------|--------------|---------|-------|----------|-------------------|------------|---------|
| REAL OTP | `api.js` Bearer + device | `POST /auth/otp/*` Twilio Verify | Auth sessions | n/a | Session tokens in LS | No SMS claim when field-test; prod claims SMS via Twilio | **PASS wire** / Evidence Pack **NOT STARTED** |
| REAL PROFILE | `#profile-next-btn` → `POST /me/profile` | `GET/POST /me` | Engine + mirror (`ProtocolIdentity`) | none | Durability **IN PROGRESS** (Neon provisioned; cert after redeploy) | Removed `data-go` skip | **PASS wire** / durable **IN PROGRESS** |
| REAL RADAR | `radarActivate` + `candidatesToDots` | `/radar/*` | Presence ephemeral (Redis target) | `radar.changed` | Must re-activate | Ghost dots removed | **PASS alone=0** / geo hardcode remains |
| REAL SIGNAL | send as self; receive via WS | `/signals` | Engine + mirror | `signal.received` | Durability IN PROGRESS | Sender no longer fakes incoming | **PASS wire** / Evidence Pack NOT STARTED |
| REAL SELFIE A/B | own opaque `mediaId` only | `POST .../selfie` | Connection state only | `validation.updated` | Connection id | Peer impersonation gated to lab | **OPEN** (private media) |
| REAL MUTUAL | approve as initiator | `POST .../approve` | Connection | `validation.updated` | if durable | — | **PASS wire** |
| REAL MISSION CHAT | `message` + WS + `GET .../messages` | messages + `mission.message` | Redis ephemeral target | `mission.message` | Durability IN PROGRESS | No fake chat states on product | **PASS wire** / durable IN PROGRESS |
| REAL MISSION MODE | meet-now / lets-meet / finish | connection transitions | Connection | `mission.updated` | if durable | — | **PASS wire** |
| REAL OUTCOME | own outcome only | `POST .../outcome` | Connection | `mission.updated` | if durable | Peer sim lab-only | **PASS wire** |
| REAL COOLDOWN → RADAR | cooldown UI + deactivate/activate | connection + presence | Presence ephemeral | — | presence no | — | **PASS wire** |

## Gate A / B / C

| Gate | Status |
|------|--------|
| **A** Radar ghosts / alone → nearby=0 | **PASS** (code + unit tests). |
| **B** Profile/consent CTA vs keyboard | Desktop OK; form-footer `--vv-offset`. Evidence Pack later. |
| **C** Real profile save | **WIRED**. Durable **IN PROGRESS** (Postgres provisioned; await ready=prisma + restart cert). |

## S27–S34 honesty

| Sprint | Status |
|--------|--------|
| S27A | **OPEN** — Evidence Pack **NOT STARTED** (blocked until durability) |
| S27B | **OPEN** — Twilio configured; SMS evidence later |
| S28 | **IN PROGRESS** — Neon + Upstash Production; fail-closed memory; migrate applied; redeploy + durability cert next |
| S29 | **PARTIAL wire** — Redis now provisioned; multi-phone later |
| S30 | **PARTIAL** — hardcoded Luxembourg coords remain |
| S31 | **OPEN** — no private media storage provider in repo |
| S32–S34 | **QUEUED / BLOCKED** upstream |

## PRODUCT PROTOCOL READY

**= NO**

Do **not** start two-phone Evidence Pack until S28 durability scenario (step 5) is green.
