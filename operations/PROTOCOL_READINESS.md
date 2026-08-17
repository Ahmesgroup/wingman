# Protocol readiness — PRODUCT PROTOCOL READY

**Status:** **NO**  
**Updated:** 2026-08-17  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/

Destiny OFF · Payments OFF · No fake public peers · No `x-user-id` on public prod.

## Locked status (honest)

| Area | Status |
|------|--------|
| Protocol wiring | **improved** |
| Production durability | **GO (infra)** — steps 1–5 complete |
| Private selfie media | **WIRED (infra)** — Evidence Pack still open |
| Two-phone Evidence Pack | **NOT STARTED / BLOCKED** |
| PRODUCT PROTOCOL READY | **NO** |

## Live Production probe (2026-08-17 post-S28)

| Check | Before | After |
|-------|--------|-------|
| `GET /internal/ready` | ephemeral=memory, persistence=memory, database=not-configured | **ephemeral=redis, persistence=prisma, database=postgres, ready=true** |
| Durability cert | n/a | identity+connection marker survived Production redeploy |

S28 detail: [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md).  
S31 detail: [`S31_PRIVATE_SELFIE_MEDIA.md`](./S31_PRIVATE_SELFIE_MEDIA.md) — Vercel Blob private + camera upload path.

## Protocol readiness matrix

| Step | Frontend SoT | Backend | Store | Realtime | Survives refresh? | Demo leak? | Verdict |
|------|--------------|---------|-------|----------|-------------------|------------|---------|
| REAL OTP | `api.js` Bearer + device | `POST /auth/otp/*` Twilio Verify | Auth sessions | n/a | Session tokens in LS | No SMS claim when field-test; prod claims SMS via Twilio | **PASS wire** / Evidence Pack **NOT STARTED** |
| REAL PROFILE | `#profile-next-btn` → `POST /me/profile` | `GET/POST /me` | Engine + mirror (`ProtocolIdentity`) | none | **Durability GO (infra)** | Removed `data-go` skip | **PASS wire** / durable **GO (infra)** |
| REAL RADAR | `radarActivate` + `candidatesToDots` | `/radar/*` | Presence ephemeral (Redis target) | `radar.changed` | Must re-activate | Ghost dots removed | **PASS alone=0** / geo hardcode remains |
| REAL SIGNAL | send as self; receive via WS | `/signals` | Engine + mirror | `signal.received` | Durability IN PROGRESS | Sender no longer fakes incoming | **PASS wire** / Evidence Pack NOT STARTED |
| REAL SELFIE A/B | camera → private upload → opaque `mediaId` | `POST .../media` + `POST .../selfie` + authorized `GET .../media/:id` | private Blob + Connection | `validation.updated` | Connection id | Peer impersonation gated to lab | **WIRED (infra)** / Evidence Pack **NOT STARTED** |
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
| **C** Real profile save | **WIRED**. Durable **GO (infra)** after S28 cert. |

## S27–S34 honesty

| Sprint | Status |
|--------|--------|
| S27A | **OPEN** — Evidence Pack **NOT STARTED** (blocked until durability) |
| S27B | **OPEN** — Twilio configured; SMS evidence later |
| S28 | **GO (infra)** — Neon + Upstash; fail-closed; ready=prisma/redis/postgres; durability cert passed |
| S29 | **PARTIAL wire** — Redis live; multi-phone Evidence Pack later |
| S30 | **PARTIAL** — hardcoded Luxembourg coords remain |
| S31 | **WIRED (infra)** — `@wingman/media` + Vercel Blob private; Evidence Pack NOT STARTED |
| S32–S34 | **QUEUED / BLOCKED** upstream |

## PRODUCT PROTOCOL READY

**= NO**

Two-phone Evidence Pack remains **NOT STARTED**. Private selfie media is **WIRED (infra)** but not GREEN until field evidence.
