# Backend Implementation Status (S0–S20)

**Status:** Implemented · **Backend V1 certified GO** · **Language:** English  
**Related:** [`apps/BACKEND_README.md`](../apps/BACKEND_README.md), [`operations/PRODUCTION_READINESS.md`](../operations/PRODUCTION_READINESS.md), [`operations/S16_PERSISTENCE_LIVE.md`](../operations/S16_PERSISTENCE_LIVE.md), [`operations/S17_WEBSOCKET.md`](../operations/S17_WEBSOCKET.md), [`operations/S18_PROVIDERS.md`](../operations/S18_PROVIDERS.md), [`operations/S19_BILLING_ENTITLEMENTS.md`](../operations/S19_BILLING_ENTITLEMENTS.md), [`operations/S20_PRODUCTION_CERTIFICATION.md`](../operations/S20_PRODUCTION_CERTIFICATION.md), [`architecture/STATE_MACHINES.md`](../architecture/STATE_MACHINES.md)

This document describes the **executable backend** that was built from the V4.1 product & engineering specification. It covers:

1. **S0–S7 — Protocol engine** (`packages/domain` + contracts/database bootstrap) — **frozen**
2. **S8–S12 — Production envelope** (NestJS API, auth, ephemeral Redis layer, push, observability)
3. **S13–S15 — Persistence write-behind + provider ports** (domain still frozen; Nest mirrors outcomes)
4. **S16 — Live Prisma + deterministic boot hydration** (PostgreSQL durable; Redis ephemeral-only)
5. **S17 — WebSocket realtime transport** (same application services as HTTP; no parallel domain)
6. **S18 — Production SMS/Push providers + channel orchestrator** (no vendor imports in protocol modules)
7. **S19 — Billing → Entitlements** (Stripe as external billing facts; backend-owned rights)
8. **S20 — Production certification** (multi-instance, chaos, load/races, observability, go/no-go) — **Backend V1 GO**
9. **V1.1 S21 — Radar Intelligence** (feature-flagged ordering above immutable V1 eligibility)
10. **V1.1 S22 — Context Engine** (normalized ephemeral context for Radar/Destiny/Geo)

The original product specs under `docs/`, `architecture/`, `api/` remain authoritative for product rules. This file is authoritative for **what code exists today** and how to operate it.

---

## 1. Non-negotiable rules

1. **The backend is the authority of state.** Clients request transitions; they never declare timers or terminal states.
2. **Server-authoritative timers** use absolute `expiresAt` (UTC). Workers reconcile expirations; correctness must not depend on a cron firing at the exact second ([ADR-005](../architecture/ADR/ADR-005-SERVER-AUTHORITATIVE-TIMERS.md)).
3. **All protocol mutations go through `packages/domain`** (primarily `WingmanEngine`). Nest controllers stay thin.
4. **S0–S7 domain is frozen.** Infrastructure (Nest, Redis, push, auth) wraps the domain. Do not rewrite protocol rules to fit infra.
5. **No frontend work** was done in these sprints. The engine is testable without UI.

---

## 2. Repository layout (application code)

```text
wingman/
├── apps/
│   ├── api/                 NestJS HTTP API (S8+)
│   ├── workers/             Expiration reconciler
│   └── BACKEND_README.md    Developer quick start
├── packages/
│   ├── domain/              Pure protocol engine (S0–S7, FROZEN)
│   ├── contracts/           Zod request schemas + ERROR_CATALOG
│   ├── database/            Prisma schema copy + invariant SQL stubs
│   ├── auth/                OTP, sessions, refresh, device binding (S9)
│   ├── ephemeral/           Memory/Redis presence, locks, quotas, pub/sub (S10)
│   ├── notifications/       Push orchestrator: idempotency, retries, DLQ (S11)
│   ├── observability/       Structured logs, metrics, readiness helper (S12)
│   ├── persistence/         ProtocolRepository + write-behind mirror (S13)
│   ├── providers/           SMS OTP + push transport ports (S14)
│   └── realtime/            Envelope, rooms, hub, replay buffer (S17)
├── infrastructure/docker/   Postgres + Redis compose
└── operations/
    └── PRODUCTION_READINESS.md
```

Tooling: **pnpm workspaces** + Turborepo scripts at the root (`pnpm -r test`, `pnpm -r build`).

---

## 3. Protocol loop (product core)

```text
Presence → Radar → Signal → Mutual Validation → Match (Connection)
  → Mission Meet → Mission Mode → Cooldown → Radar

Destiny Engine ──(feature-flagged)──► exceptional connection path
```

Implemented in [`packages/domain/src/engine.ts`](../packages/domain/src/engine.ts) as `WingmanEngine`.

### 3.1 Domain modules

| Area | Path | Responsibility |
|------|------|----------------|
| Clock | `packages/domain/src/clock.ts` | `Clock`, `FakeClock`, UTC day keys |
| Errors | `packages/domain/src/errors.ts` | `DomainError` codes |
| Connection SM | `packages/domain/src/connection/` | Allowed/forbidden transitions, selfie → mission → cooldown |
| Signal | `packages/domain/src/signal/` | Create/open/refuse/cancel/expire/accept; silent expiry |
| Presence | `packages/domain/src/presence/` | Online + visibility + TTL |
| Radar | `packages/domain/src/radar/` | Distance bands, interest filters, precision protection |
| Safety | `packages/domain/src/safety/` | Block/report/consent helpers, anti-contact filter |
| Destiny | `packages/domain/src/destiny/` | Copresence + prompt (disabled unless enabled) |
| Idempotency | `packages/domain/src/idempotency.ts` | In-memory idempotency store used by signal create |
| Facade | `packages/domain/src/engine.ts` | `WingmanEngine` orchestrating the full loop |

### 3.2 Entitlements (stubs)

Free vs Wingman+ quotas/windows are encoded in `entitlementsFor()` (`types.ts`):

- Signal daily limit: Free 2 / Plus 25
- Selfie window: 5 min (+5 Plus)
- Ticket duration: 2h Free / 24h Plus
- Mission Meet: 15 min Free / 20 min Plus
- Cooldown: 30 min if any YES / 15 min if both NO/timeout

No Stripe integration yet — Plus is a seed flag (`wingmanPlus` on user seed).

---

## 4. Sprint delivery — S0–S7 (frozen engine)

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S0** | Foundations & contracts | Monorepo, `packages/domain` state machines, Zod contracts, Prisma package, Docker Compose, error catalog, UTC clock, audit events on engine | All allowed/forbidden connection transitions tested |
| **S1** | Presence Engine | Activate/deactivate, visibility, heartbeat TTL (~120s), reaper | No ghost users on radar after TTL |
| **S2** | Radar Engine | Approximate bands, sex/interest filters, block filter, precision protection (no exact coords in API payloads) | Eligible users see each other without exact location |
| **S3** | Signal Engine | Create/open/refuse/cancel/expire, Free/+ quotas, pair uniqueness, idempotency, silent expiry | No double active signal / quota bypass |
| **S4** | Mutual Validation & Match | Accept → Connection + locks; selfie states; approve → `MUTUALLY_VALIDATED` | Match impossible without mutual validation |
| **S5** | Mission Engine | Meet now / ticket path, mission messages, outcomes, cooldown, return to radar; reconcile | Full cycle without frontend |
| **S6** | Safety / Privacy | Block (closes signals/connections, radar exclusion), report, consent records, anti-contact filter | Safety invariants under adversarial cases |
| **S7** | Hardening + Destiny FF | Race/idempotent reconcile tests; Destiny behind flag (default off) | E2E loop green; Destiny dark by default |

### 4.1 Domain tests (regression baseline)

```bash
pnpm --filter @wingman/domain test
```

**15 tests** covering transition matrix, S1–S3 engines, S4–S7 engines, hardening races.

**Freeze rule:** Do not change protocol behavior in `packages/domain` unless there is an objectified bug (reproducible proof) and an explicit decision.

---

## 5. Sprint delivery — S8–S12 (production envelope)

Infrastructure **wraps** the frozen domain. Nest services call `WingmanEngine`; Redis/ephemeral dual-writes presence and distributed locks without changing transition tables.

```text
Mobile
  │
  ▼
NestJS API
  ├── Auth / OTP          (@wingman/auth)
  ├── Wingman Domain      (@wingman/domain)  ← frozen
  ├── Safety / Privacy
  └── Notification Orchestrator
          │
          ▼
       Event publish (ephemeral pub/sub)
       /              \
 PostgreSQL (schema)   Redis / Memory ephemeral
 durable truth (next)  presence / TTL / locks / quotas
                              │
                              ▼
                        Push workers (in-process queue today)
```

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S8** | NestJS strict | Modular Nest API; Zod validation pipe; `DevAuthGuard` (`x-user-id`); `DomainExceptionFilter`; thin controllers; architecture test | No business logic in controllers; Nest e2e loop green; domain still 15/15 |
| **S9** | Auth & identity | `@wingman/auth`: OTP request/verify, session + refresh, revoke, device binding, OTP rate limit; Nest `/auth/*`; `SessionAuthGuard` | Cannot replay revoked session; device mismatch rejected |
| **S10** | Redis ephemeral & multi-instance | `@wingman/ephemeral` Memory + Redis stores; presence TTL sync; distributed lock on signal accept; quotas/pub-sub ports | Multi-instance accept: only one winner |
| **S11** | Push & events | `@wingman/notifications` orchestrator; enqueue on Signal/Match/Mission; idempotency keys; retries; dead-letter; deep links | No double send; DLQ after max retries |
| **S12** | Production hardening | `@wingman/observability` structured logs (redaction) + metrics; `GET /internal/ready`; production readiness doc | Readiness documented and measurable |

---

## 6. NestJS API (`apps/api`)

### 6.1 Modules

| Module | Routes (summary) |
|--------|------------------|
| Health | `GET /health` |
| Dev | `POST /dev/seed` (test seeding) |
| Auth | `POST /auth/otp/request`, `/otp/verify`, `/refresh`, `/logout` |
| Radar | `POST /radar/activate\|deactivate\|heartbeat`, `GET /radar/candidates` |
| Signals | `POST /signals`, `/:id/open\|refuse\|cancel\|accept` |
| Connections | selfie, approve, meet-now, ticket*, messages, outcome, cooldown/skip |
| Safety | `POST /safety/block`, `/safety/report` |
| Privacy | `POST /privacy/consent` |
| Destiny | `POST /destiny/copresence` (throws if Destiny disabled) |
| Internal | `POST /internal/reconcile`, `GET /internal/metrics`, `GET /internal/ready` |

### 6.2 Cross-cutting

- **Validation:** Zod schemas from `@wingman/contracts` via `ZodValidationPipe`
- **Errors:** `DomainError` / `AuthError` → HTTP mapping (`ERROR_CATALOG`)
- **Auth (dev):** `DevAuthGuard` + header `x-user-id` (default for local/e2e)
- **Auth (real):** `SessionAuthGuard` + `Authorization: Bearer` + `x-device-id` (`useDevAuth: false`)
- **Public routes:** `@Public()` on health, auth, dev, internal
- **Observability interceptor:** request metrics + structured logs
- **Engine injection:** `WINGMAN_ENGINE` token → singleton `WingmanEngine`

### 6.3 Architecture constraint (enforced by test)

Controllers must not inject `WINGMAN_ENGINE` or call `this.engine.*`. Only `*.service` classes and the engine module may call the domain. See `apps/api/src/architecture.test.ts`.

---

## 7. Auth package (`packages/auth`)

| Capability | Behavior |
|------------|----------|
| Phone lookup | HMAC-style hash with server pepper (no raw phone stored in challenge index beyond lookup hash) |
| OTP | 6-digit code, hashed; TTL; max attempts; per-phone rate window |
| Session | Access + refresh tokens (hashed at rest in memory store) |
| Device binding | Session bound to `deviceId`; mismatch → `DEVICE_MISMATCH` |
| Refresh | Rotates session; old access invalidated |
| Revoke / logout | Marks session revoked; replay fails |

Debug: set `AUTH_DEBUG_OTP=true` to return `debugCode` from OTP request (local/test only).

---

## 8. Ephemeral layer (`packages/ephemeral`)

Not a generic HTTP cache — the **ephemeral engine surface**:

| Capability | Memory | Redis (`REDIS_URL`) |
|------------|--------|---------------------|
| Presence + TTL | Yes | Yes (`presence:{userId}`, GEO `radar:geo`) |
| Distributed lock | Yes | Yes (`SET NX` + Lua release) |
| Quotas | Yes | Yes (`INCR` + `EXPIRE`) |
| Pub/sub | In-process | Redis pub/sub |

Nest `RadarService` dual-writes domain presence + ephemeral store. `SignalsService.accept` acquires `signal-accept:{id}` lock before domain accept.

---

## 9. Notifications (`packages/notifications`)

`NotificationOrchestrator`:

1. `enqueue(event)` — rejects duplicates by `idempotencyKey` if already PENDING/SENT
2. `processQueue()` — delivers via `PushTransport`
3. On failure — retry until `maxAttempts`, then **DEAD** + DLQ
4. Deep links: `wingman://signals|connections|missions|destiny/...`

Default Nest transport: `InMemoryPushTransport`. Set `PUSH_PROVIDER=logging` to use `LoggingPushTransport` from `@wingman/providers` (still no APNs/FCM).

Emitted from Nest services on signal create, connection create/validate, mission open.

---

## 10. Observability (`packages/observability`)

- **StructuredLogger** — JSON lines; redacts phone/token/selfie/lat/lng fields
- **MetricsRegistry** — counters + simple histograms (p50/p95)
- **buildReadiness** — aggregates check map → `{ ready, checks, measuredAt }`

API:

- `GET /internal/metrics` — engine counters + HTTP metrics snapshot
- `GET /internal/ready` — domain + ephemeral probe

---

## 11. Workers (`apps/workers`)

`runReconcilePass(engine)` calls `engine.reconcile()` for presence/signals/connections expirations. Can call `POST /internal/reconcile` when `API_INTERNAL_URL` is set.

---

## 12. How to run

### Install & test

```bash
pnpm install
pnpm -r test
```

Expected: domain 15 tests + auth/ephemeral/notifications/observability + Nest API (architecture, e2e loop, auth e2e, multi-instance) + workers.

### Local API

```bash
# Optional infrastructure
docker compose -f infrastructure/docker/docker-compose.yml up -d

export AUTH_DEBUG_OTP=true
# export REDIS_URL=redis://127.0.0.1:6379
# export DESTINY_ENABLED=false   # default

pnpm --filter @wingman/api dev
curl -s http://localhost:3000/health
curl -s http://localhost:3000/internal/ready
```

### Example protocol smoke (dev auth)

```bash
curl -s -X POST localhost:3000/dev/seed -H 'content-type: application/json' \
  -d '{"id":"a","gender":"MALE","interestedIn":["WOMEN"]}'
curl -s -X POST localhost:3000/dev/seed -H 'content-type: application/json' \
  -d '{"id":"b","gender":"FEMALE","interestedIn":["MEN"]}'

curl -s -X POST localhost:3000/radar/activate -H 'x-user-id: a' -H 'content-type: application/json' \
  -d '{"lat":48.8566,"lng":2.3522}'
curl -s -X POST localhost:3000/radar/activate -H 'x-user-id: b' -H 'content-type: application/json' \
  -d '{"lat":48.8567,"lng":2.3523}'

curl -s localhost:3000/radar/candidates -H 'x-user-id: a'
```

### Example auth smoke

```bash
export AUTH_DEBUG_OTP=true
curl -s -X POST localhost:3000/auth/otp/request -H 'content-type: application/json' \
  -d '{"phoneE164":"+33600000000"}'
# use debugCode from response
curl -s -X POST localhost:3000/auth/otp/verify -H 'content-type: application/json' \
  -d '{"phoneE164":"+33600000000","code":"XXXXXX","deviceId":"dev-1"}'
# then Authorization: Bearer <accessToken> + x-device-id: dev-1
```

---

## 13. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | API port |
| `DESTINY_ENABLED` | `false` | Enable Destiny prompts |
| `AUTH_PEPPER` | `dev-pepper-change-me` | Auth hashing pepper |
| `AUTH_DEBUG_OTP` | unset | Return OTP in response (dev/test only) |
| `AUTH_ALLOW_DEV` | set by AppModule | Allow `x-user-id` when using session guard |
| `REDIS_URL` | unset | Use Redis ephemeral store; else memory |
| `SMS_PROVIDER` | `console` | `noop` disables SMS delivery |
| `PUSH_PROVIDER` | unset | `logging` uses LoggingPushTransport |
| `DATABASE_URL` | unset | Live Prisma protocol repo when reachable |
| `PROTOCOL_HYDRATE` | unset | `false` skips boot hydrate |
| `API_INTERNAL_URL` | unset | Workers POST reconcile target |
| `FAKE_CLOCK` | unset | (legacy/main) not required for Nest tests |
| `NODE_ENV` | — | `test` skips listen in some entrypoints |

---

## 14. Git history (implementation commits)

Approximate commit trail on `master`:

| Commit theme | Meaning |
|--------------|---------|
| `chore: baseline...` | Spec + prototype import |
| `S0` … `S7` | Frozen engine gates |
| `S8: NestJS strict...` | Nest API + auth/ephemeral/notifications/observability packages |
| `S9` … `S12` | Gate markers for production envelope |
| `S13` … `S15` | Persistence write-behind + SMS/push provider ports + Nest wiring |
| `S16` | Live Prisma durable tables + deterministic boot hydration |
| `S17` | WebSocket transport + multi-client realtime gates |
| `S18` | Production SMS/Push providers + device tokens |
| `S19` | Billing → Entitlements (Stripe facts → backend rights) |
| `S20` | Production certification — Backend V1 GO |

Always re-verify with `pnpm -r test` after pulls.

---

## 15. Sprint delivery — S13–S15 (persistence + providers)

Infrastructure continues to **wrap** the frozen domain. Persistence mirrors domain outcomes; providers deliver OTP/push without owning protocol rules.

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S13** | Protocol persistence ports | `@wingman/persistence`: `ProtocolRepository`, `MemoryProtocolRepository`, `PrismaProtocolRepository` (Prisma-shaped client), `ProtocolPersistenceMirror` write-behind | Mirror equals domain state after mutations; domain tests still 15/15 |
| **S14** | Provider ports | `@wingman/providers`: `SmsProvider` (`Console` / `Noop`), `LoggingPushTransport`, `OtpDeliveryService` | OTP delivered via SMS port; push idempotency/retry tests green |
| **S15** | Nest integration | Nest injects mirror into radar/signals/connections/safety/privacy/dev/internal; auth uses `OtpDeliveryService`; readiness/metrics include persistence | `persistence.e2e.test.ts` green |

### 15.1 Persistence model

```text
HTTP → Nest service → WingmanEngine (authority)
                    ↘ ProtocolPersistenceMirror → ProtocolRepository
```

- **Default repo:** `MemoryProtocolRepository` when `DATABASE_URL` is unset.
- **Postgres path (S16):** `LivePrismaProtocolRepository` via `DATABASE_URL` + `Protocol*` tables (domain-faithful JSON). Full identity `User` (phone crypto) remains separate.
- Presence remains Redis-authoritative and is **not** hydrated from PostgreSQL.

### 15.2 Providers model

- `POST /auth/otp/request` → `OtpDeliveryService` → `AuthService.requestOtp` + `SmsProvider.send` (phone redacted in provider logs).
- `SMS_PROVIDER=noop` disables SMS; default is `ConsoleSmsProvider`.
- `PUSH_PROVIDER=logging` swaps Nest push transport to `LoggingPushTransport`.

### 15.3 Tests added

```bash
pnpm --filter @wingman/persistence test   # mirror + prisma port
pnpm --filter @wingman/providers test     # SMS + push ports
pnpm --filter @wingman/api test           # includes persistence.e2e.test.ts
```

---

## 16. Sprint delivery — S16 (live persistence + boot hydrate)

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S16** | PostgreSQL durable reconstruction | `Protocol*` Prisma tables, `LivePrismaProtocolRepository`, `hydrateFromRepository`, Nest `ProtocolBootService`, accept `$transaction`, readiness `database` check | Restart without durable divergence; presence not revived |

### 16.1 Invariant

```text
PostgreSQL = durable protocol state for boot reconstruction
Redis      = presence TTL, transient radar, locks, rate limits, short coordination
```

Hydration clears process maps, loads durable snapshot, rebuilds locks for non-terminal active connections, runs `engine.reconcile()`, and never restores `presence` / `locations`.

See [`operations/S16_PERSISTENCE_LIVE.md`](../operations/S16_PERSISTENCE_LIVE.md).

---

## 17. Sprint delivery — S17 (WebSocket transport)

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S17** | Realtime transport only | `@wingman/realtime` hub/envelope/replay; Nest `RealtimeGateway` + `RealtimeAppService`; publish from radar/signals/connections/safety/reconcile; Redis bus via ephemeral | Multi-client WS e2e + gateway architecture gate |

### 17.1 Rules

- WS gateway **does not** import `@wingman/domain`
- Rooms are server-assigned: `user:`, `radar:`, `connection:`, `mission:`
- Envelope: `eventId`, `type`, `occurredAt`, `aggregateId`, `version`, `payload`, `rooms`
- Resume replays missing durable events; presence/radar use snapshot only

See [`operations/S17_WEBSOCKET.md`](../operations/S17_WEBSOCKET.md).

---

## 18. Sprint delivery — S18 (production providers)

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S18** | Real SMS + mobile push behind ports | Twilio HTTP SMS + ReliableSms; FCM/APNs mobile transport; device token registry; orchestrator statuses `PENDING/SENT/INVALID_DEVICE/DEAD`; `POST /devices/push-token` | Provider tests + architecture: no vendors in signals/connections |

See [`operations/S18_PROVIDERS.md`](../operations/S18_PROVIDERS.md).

---

## 19. Sprint delivery — S19 (Billing → Entitlements)

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S19** | Billing → Entitlements (not Stripe-in-domain) | `@wingman/billing`: plan model, Stripe port, webhook idempotence by `event.id`, reconciler → `BillingState` → `EntitlementService.forUser`; Nest `/billing/*`; Prisma `BillingAccount` / `BillingWebhookEvent` | billing package tests + `billing.e2e.test.ts` + architecture: no Stripe in domain/protocol |

### 19.1 Rules

- Stripe is an **external source of billing facts**; Wingman decides effective entitlements
- Domain asks `entitlements.forUser(userId, now)` (wired via `WingmanEngine.setEntitlementsForUser`) — never reads Stripe objects or client `isPremium`
- Pipeline: Stripe → Billing Adapter → Billing State → Entitlement Service → signal/ticket/mission caps
- Webhook replay is idempotent; cancel-at-period-end keeps Plus until `currentPeriodEnd`
- Stripe outage must not break core protocol; restart reconstructs rights from DB/cache

See [`operations/S19_BILLING_ENTITLEMENTS.md`](../operations/S19_BILLING_ENTITLEMENTS.md).

---

## 20. Sprint delivery — S20 (production certification)

| Sprint | Objective | What was built | Exit gate |
|--------|-----------|----------------|-----------|
| **S20** | Certify existing backend (no product features) | `s20.certification.test.ts` G1–G4; `GET /internal/live`; requestId correlation + p99 metrics; [`operations/S20_PRODUCTION_CERTIFICATION.md`](../operations/S20_PRODUCTION_CERTIFICATION.md) with binary **GO** | All G1–G5 PASS; Backend V1 frozen |

### 20.1 Rules

- Certification only — must not change S0–S19 business rules to pass
- Five gates: multi-instance, recovery/chaos, load/races, observability, go/no-go
- Post-GO work is **V1.1 / advanced engine**, not V1 core

See [`operations/S20_PRODUCTION_CERTIFICATION.md`](../operations/S20_PRODUCTION_CERTIFICATION.md).

---

## 21. What is intentionally not in Backend V1

- Live staging credentials for Twilio / FCM HTTP v1 / APNs JWT / Stripe (adapters ready; ops wiring)
- Geo optimization ~~(S25)~~ done as V1.1 flagged engine; live staging provider credentials
- Multi-region product features beyond single-EU compose envelope
- Mobile / web / admin application UIs

---

## 22. Where to go next (V1.1+)

Backend V1 is frozen. Advanced engines are feature-flagged and must not change V1 eligibility rules.

| Sprint | Doc |
|--------|-----|
| **S21** Radar Intelligence | [`operations/S21_RADAR_INTELLIGENCE.md`](../operations/S21_RADAR_INTELLIGENCE.md) — **done** |
| **S22** Context Engine | [`operations/S22_CONTEXT_ENGINE.md`](../operations/S22_CONTEXT_ENGINE.md) — **done** |
| **S23** Destiny V2 | [`operations/S23_DESTINY_V2.md`](../operations/S23_DESTINY_V2.md) — **done** |
| **S24** Anti-Abuse | [`operations/S24_ANTI_ABUSE.md`](../operations/S24_ANTI_ABUSE.md) — **done** |
| **S25** Geo Intelligence | [`operations/S25_GEO_INTELLIGENCE.md`](../operations/S25_GEO_INTELLIGENCE.md) — **done** |
| S26 roadmap | [`operations/V1.1_ADVANCED_ENGINE.md`](../operations/V1.1_ADVANCED_ENGINE.md) |

1. **S26** Measurement & Engine Audit — prove S21–S25 improve quality without more blocks/abuse/geo exposure
2. Staging credential & load-test campaign in real Redis/Postgres
3. Optional **S24.1** Destiny proposal persistence (not mixed into geo)

---

## 23. Quick reference — key files

| Concern | File |
|---------|------|
| Protocol facade | [`packages/domain/src/engine.ts`](../packages/domain/src/engine.ts) |
| Connection transitions | [`packages/domain/src/connection/transitions.ts`](../packages/domain/src/connection/transitions.ts) |
| Persistence mirror | [`packages/persistence/src/mirror.ts`](../packages/persistence/src/mirror.ts) |
| Boot hydrate | [`packages/persistence/src/hydrate.ts`](../packages/persistence/src/hydrate.ts) |
| Live Prisma repo | [`packages/persistence/src/live-prisma-repository.ts`](../packages/persistence/src/live-prisma-repository.ts) |
| Realtime hub | [`packages/realtime/src/hub.ts`](../packages/realtime/src/hub.ts) |
| WS gateway | [`apps/api/src/modules/realtime/realtime.gateway.ts`](../apps/api/src/modules/realtime/realtime.gateway.ts) |
| Realtime app facade | [`apps/api/src/modules/realtime/realtime-app.service.ts`](../apps/api/src/modules/realtime/realtime-app.service.ts) |
| Provider ports | [`packages/providers/src/index.ts`](../packages/providers/src/index.ts) |
| Billing / entitlements | [`packages/billing/src/index.ts`](../packages/billing/src/index.ts) |
| Nest app composition | [`apps/api/src/app.module.ts`](../apps/api/src/app.module.ts) |
| WS e2e | [`apps/api/src/ws.e2e.test.ts`](../apps/api/src/ws.e2e.test.ts) |
| Billing e2e | [`apps/api/src/billing.e2e.test.ts`](../apps/api/src/billing.e2e.test.ts) |
| S20 certification | [`apps/api/src/s20.certification.test.ts`](../apps/api/src/s20.certification.test.ts) |
| Restart gate | [`apps/api/src/restart.e2e.test.ts`](../apps/api/src/restart.e2e.test.ts) |
| Nest e2e loop | [`apps/api/src/e2e.test.ts`](../apps/api/src/e2e.test.ts) |
| Architecture gates | [`apps/api/src/architecture.test.ts`](../apps/api/src/architecture.test.ts) |
| S16 runbook | [`operations/S16_PERSISTENCE_LIVE.md`](../operations/S16_PERSISTENCE_LIVE.md) |
| S17 runbook | [`operations/S17_WEBSOCKET.md`](../operations/S17_WEBSOCKET.md) |
| S18 runbook | [`operations/S18_PROVIDERS.md`](../operations/S18_PROVIDERS.md) |
| S19 runbook | [`operations/S19_BILLING_ENTITLEMENTS.md`](../operations/S19_BILLING_ENTITLEMENTS.md) |
| S20 certificate | [`operations/S20_PRODUCTION_CERTIFICATION.md`](../operations/S20_PRODUCTION_CERTIFICATION.md) |
| V1.1 roadmap | [`operations/V1.1_ADVANCED_ENGINE.md`](../operations/V1.1_ADVANCED_ENGINE.md) |
| S21 Radar Intelligence | [`packages/radar-intelligence/src/index.ts`](../packages/radar-intelligence/src/index.ts) |
| S22 Context Engine | [`packages/context-engine/src/index.ts`](../packages/context-engine/src/index.ts) |
| Production checklist | [`operations/PRODUCTION_READINESS.md`](../operations/PRODUCTION_READINESS.md) |
