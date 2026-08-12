# Decision Log

Chronological record of decisions that resolve ambiguities or contradictions in the source material.
Each entry: the question, the options, the decision, and the rationale. Formal architecture decisions
also have an ADR in `architecture/ADR/`.

Status legend: **Decided** · **Provisional** (revisit with data) · **Open** (see `ASSUMPTIONS_AND_OPEN_QUESTIONS.md`).

---

## D-001 — Backend stack: modular monolith, no Rust in V1
**Decided.** The earlier proposal introduced Rust, a distributed PostgreSQL and multi-region on day one.
For a European launch at thousands–tens of thousands of users this is over-engineered infrastructure paired
with an under-engineered domain. We ship a **NestJS modular monolith + PostgreSQL + Redis + workers**,
single EU region. Rust and multi-region are introduced only when load metrics justify it. See ADR-001, ADR-006.

## D-002 — The real asset is the protocol, not the language
**Decided.** Engineering effort concentrates on the connection state machine, invariants, and privacy —
who can see whom, who can report whom, in what state, for how long, and what happens to each datum after
expiry. This is codified in `packages/domain`, kept free of Prisma/NestJS/Redis/AWS imports.

## D-003 — Age stored as birth date, not integer
**Decided.** `age Int` becomes wrong over time. We store `birthDate @db.Date` and derive age. Minimum age
is **18** (see D-020); majority is validated during identity verification.

## D-004 — Phone protection: deterministic HMAC + AES-256-GCM
**Decided.** A random per-user salt would break lookup. We use `phoneLookupHash = HMAC-SHA256(server_pepper, E164)`
for uniqueness/search, and a separate authenticated ciphertext `phoneCiphertext = AES-256-GCM(E164)` with
`phoneKeyVersion` for rotation. No raw phone number is ever stored. See `security/PHONE_NUMBER_PROTECTION.md`.

## D-005 — One active connection per user, enforced by the database
**Decided.** A unique-per-pair index is insufficient (a user could be simultaneously active with several
others). We add `ActiveUserLock` whose primary key is `userId`; the two locks are inserted in the same
transaction as the connection, so the database itself blocks a second concurrent connection.

## D-006 — Session uniqueness allows history
**Decided.** A permanent `@@unique([userAId, userBId])` would forbid a pair from ever reconnecting. We use a
**partial** unique index `UNIQUE(pairKey) WHERE isActive` (created in a hand-written migration) so only one
*active* connection per pair exists while full history is preserved.

## D-007 — Roles are separate from pair normalization
**Decided.** Alphanumeric ordering (`pairLowId`/`pairHighId`/`pairKey`) is used only for the pair identity.
Business roles `initiatorId`/`recipientId` are stored separately, because the selfie sequence and response
windows are directional.

## D-008 — One active Signal per pair
**Decided.** An index does not prevent duplicates. `Signal` carries `pairKey` + `isActive` with a partial
unique index `UNIQUE(pairKey) WHERE isActive`. The state machine flips `isActive=false` on ACCEPTED/EXPIRED/
CANCELLED/BLOCKED. `BLOCKED` is a first-class `SignalStatus`.

## D-009 — Fine-grained connection states
**Decided.** A single `SELFIE_EXCHANGE` bucket hides several distinct steps. We use the detailed
`ConnectionState` enum (WAITING_FOR_INITIATOR_SELFIE … COOLDOWN_ACTIVE … BLOCKED/FAILED). See `STATE_MACHINES.md`.

## D-010 — `purgeAt`, not `deletedAt`
**Decided.** A row scheduled for future deletion has not been deleted. Fields are renamed `purgeAt` (hard-delete
due date) and `endedAt` (when the interaction actually ended). Applies to Connection, MissionOutcome, ExpiredConnection.

## D-011 — Mission responses are an enum
**Decided.** Nullable booleans cannot distinguish pending / TIMEOUT / never-asked. We use
`MissionResponse { PENDING, YES, NO, TIMEOUT }`. `metConfirmed` is derived (`both == YES`) inside the atomic
transition, never allowed to drift.

## D-012 — Redis cleanup must be cell-aware
**Decided.** A single global GEO set and a region-wide heartbeat cannot remove a stale member from the correct
cell. For V1's single region we keep **one regional GEO set + one heartbeat ZSET** and filter in the service;
if cell partitioning becomes necessary we maintain `radar:{region}:{cell}`, `heartbeat:{region}:{cell}` and a
`user-cell:{region}:{userId}` reverse index so moves and expirations update the right cell. See `REDIS_ARCHITECTURE.md`.

## D-013 — No absolute "nothing touches disk" claims
**Decided.** Redis can persist via RDB/AOF/replication/backups depending on configuration. We never claim
data cannot reach disk. Instead we specify the operational policy for sensitive namespaces: AOF off, no
application snapshots, no automatic backups, EU residency, encryption in transit, logs without payloads,
access control. See `architecture/REDIS_ARCHITECTURE.md` and `security/SELFIE_SECURITY.md`.

## D-014 — Selfies: opaque media ids, never public URLs in Redis
**Decided.** Redis stores only an opaque `mediaObjectId`. Bytes live in a private EU bucket with SSE. Access
is via a short-lived signed URL (or an authorized streaming endpoint) scoped to the recipient and session,
`Cache-Control: no-store, private`, never logged. A signed URL is a *reduced exposure window*, not an absolute
protection. See `security/SELFIE_SECURITY.md`, `architecture/MEDIA_ARCHITECTURE.md`.

## D-015 — Server-authoritative timers; offline does not pause
**Decided.** Every timed state has an absolute `expiresAt` set by the server. The client renders
`remaining = expiresAt − estimatedServerTime`. Airplane mode does not pause anything; on reconnect, if
`now > expiresAt`, the expiry transition is consumed immediately. A short network tolerance (30–60s) is allowed
for action acceptance only. See ADR-005.

## D-016 — The ephemeral chat is still moderatable
**Decided.** "Nothing is stored" conflicts with safety duties. Ordinary messages are deleted on close. **Only
when a user reports during the session** are the strictly necessary items sealed into an **encrypted evidence
object stored outside PostgreSQL** (`ModerationEvidence` holds a reference + hash + `purgeAt`). Every decrypt/
view is written to `ModerationAuditLog`. See `security/MODERATION_SECURITY.md`.

## D-017 — Automatic permanent bans are not allowed
**Decided.** Coordinated false reports could weaponize an auto-ban. Multiple independent reports can trigger a
temporary automatic restriction in severe cases, but permanent decisions are auditable and generally human-reviewed.

## D-018 — Consent is per-purpose, append-only, versioned
**Decided.** A single global "data exchange" consent is replaced by `ConsentEvent` (append-only) across purposes
(CORE_MATCHING, COARSE_LOCATION, DESTINY_CONNECTION, PUSH_NOTIFICATIONS, PRODUCT_ANALYTICS) with policy version,
hash, locale and source. Core service operation relies on contractual necessity, not consent. See `privacy/CONSENT_MODEL.md`.

## D-019 — Entitlements decoupled from payments, typed values
**Decided.** Rights are `Entitlement` rows with typed values (`integerValue`/`booleanValue`/`durationSec`), not
stringly-typed and not tangled with `if (isPlus || hasNightPass || ...)`. Accounting lives in Product/Purchase/
PaymentTransaction/Subscription. `isActive` is derived, never stored.

## D-020 — Minimum age 18; Destiny off by default and likely post-V1
**Decided.** Given attraction + location + selfies, the minimum age is **18**. Destiny Connection is sensitive:
opt-in and OFF by default, no persistent trajectories, coarse aggregation only, allow-list of contexts rather
than an impossible exclusion list, short TTL, DPIA + abuse/stalking review before launch. We do **not** call the
mechanism "k-anonymity" because the pair identity is retained; it is "coarse spatial aggregation with pseudonymized
co-presence counting." See `privacy/DESTINY_PRIVACY_ASSESSMENT.md`.

## D-021 — Current intention has two values only
**Decided.** `Intention { AVAILABLE_NOW, JUST_EXPLORING }`. "In 1h/2h" contradicts a real-time protocol with
~5-minute windows.

## D-022 — Wingman+ daily signals: 20–25
**Decided.** 15/day was too tight given that most approaches will not convert; a paying user could end a day with
no meeting. The daily allowance is 20–25 (final number tuned against abuse/quality). Free stays at 2/day.

## D-023 — Connection Ticket durations extended
**Decided.** Free up to 2h (was 90 min); Wingman+ up to 24h (was 2h), 1 renewal. No chat during a Ticket.

## D-024 — Metrics: meetings as an outcome, not a rigid single formula
**Decided.** Real-world meetings are the north star and are tracked, read alongside acceptance/response/approval
rates. "meetings ÷ signals sent" is retained only as an indicative secondary metric. See `docs/SUCCESS_METRICS.md`.

## D-025 — Design: night + electric violet; emotion only on mutual interest
**Decided.** Palette is night `#0B1020` + wingman violet `#7C5CFC` + air lavender `#B9A7FF` + love rose `#FF7DAE`.
Rose appears only at Connection Confirmed. Mood dots are red/amber/white and are distinguished by **shape and
animation as well as color** so information never depends on color alone. See `design/*`.

## D-026 — Four final design refinements (Design Engineering Spec V4.0)
**Decided.** (1) The selfie exchange has no aggressive "X" — the secondary action is a quiet "Let it expire",
no red, no rejection sent. (2) Default timer uses **text + a thin linear bar**, not three simultaneous indicators
(ring reserved for the primary button or omitted). (3) The 30-second warning is derived **locally** from
synchronized server time; no exact server event at 00:30 is required. (4) A complete haptics policy is added;
`doubleSoft` is reserved exclusively for Connection Confirmed.

## D-027 — Documentation language
**Decided.** Primary technical documentation in professional English; `docs/FR_EXECUTIVE_SUMMARY.md` in French.

## D-028 — Client: mobile-first web first; payments ready but disabled
**Decided (2026-08-12).** Executable client for the protocol loop is the **mobile-first web prototype**
(`prototype/`) against Nest, not Expo yet. Payments architecture is **payment-ready, activation forbidden**:
`DisabledPaymentProvider` default, Stripe/Paddle adapters OFF, `PAYMENTS_ENABLED=false`. S19 remains the only
entitlement authority; no card data through Wingman. See `operations/CLIENT_MOBILE_PAYMENT_READINESS.md`.
