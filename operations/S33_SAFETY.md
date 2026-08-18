# S33 — Safety on the real user path

**Status:** WIRED (product path) · Evidence Pack appendix A5 **NOT STARTED**  
**Date:** 2026-08-18  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/  
**PRODUCT PROTOCOL READY:** **NO**  
**S35:** `PRODUCT_PROTOCOL_V2_ENABLED=false` — unchanged.  
**Living Map:** stays **off** by default. No Living Map feature expansion.  
**Native / TestFlight:** not started.  
**Push credentials:** not invented; web push stays fail-closed.

## What this sprint covers

Block / report / rate limits / anti-abuse must work in the **real user journey**, not only as APIs or a Mission Meet local screen.

1. **Two taps (max)** to report & block from:
   - Radar opportunity sheet
   - Discover
   - Incoming Signal
   - Selfie / Mutual (ticket after mutual)
   - Mission Meet / chat (existing `mm-report-btn` kept after UI polish)
   - Me → Safety
2. **Server enforcement** (not UI-only): a block immediately removes Radar/Discover eligibility, forbids a new Signal, closes the active connection, and invalidates Destiny for the pair. A third person still gets **404** on connection / media / chat.
3. **Human copy EN/FR** — confirm + consequence. No engine jargon on Me → Safety (no raw keys).
4. **Tests** expanded and run (see below).
5. **Live QA:** Me → Safety exists with human copy. Categories stay human-labelled.

Do **not** rewrite the anti-abuse engine. The product path posts to existing `POST /safety/report` then `POST /safety/block`.

## Entry points (public client)

| Surface | Tap 1 | Tap 2 |
|---------|-------|-------|
| Radar sheet | **Report & block** | category |
| Discover | **Report** on the row | category |
| Incoming Signal | **Report & block** | category |
| Selfie | **Report & block** | category |
| Mutual / ticket | **Report & block** | category |
| Mission Meet | **Report & block** | category |
| Me → Safety | **Report & block** | category (if someone is in this meeting / hello) |

If Me → Safety is opened with no current person, the screen explains where to report instead of failing with an engine error.

Blocking is **instant and silent**. The other person is never told. They disappear from nearby and cannot say hello again.

## Server (existing APIs)

| Call | Effect |
|------|--------|
| `POST /safety/report` | Persists a report (rate-limited burst). |
| `POST /safety/block` | Idempotent. Closes active Signal + Connection. Filters Radar / Discover both ways. Forbids a new Signal (`SIGNAL_BLOCKED`). Invalidates Destiny. Notes anti-abuse `safety.block_*`. |

Duplicate block returns the same record. Report burst (8 / 10 min) returns `RATE_LIMITED`; the client still **blocks** so safety is not delayed.

Anti-abuse Signal cooldown / Radar scrape gates are unchanged (`S24`).

## Tests

```bash
node --test prototype/protocol-client.regression.test.mjs prototype/i18n-parity.test.mjs
pnpm --filter @wingman/domain test -- src/engines.s4-s7.test.ts
pnpm --filter @wingman/api test -- src/s33.safety-path.test.ts src/dual-session.auth.e2e.test.ts src/s24.anti-abuse.test.ts
```

Covered: block removes from Radar/Discover; cannot Signal a blocked user; report persists; third-party 404 on connection/media/chat; duplicate block idempotent.

## BLOCKED / OPEN

| Item | Status |
|------|--------|
| Product path wire | **WIRED** |
| Evidence Pack appendix A5 (two human phones) | **NOT STARTED** |
| PRODUCT PROTOCOL READY | **NO** |
| Web push | **BLOCKED** (credentials — S32) |
| Native / TestFlight | **not started** |

## Verdict

| Item | Status |
|------|--------|
| GREEN | no — Evidence Pack not run |
| FIXED | product-path gaps (entry points, idempotent block, human Me → Safety, S33 tests) |
| OPEN | two-phone Evidence Pack appendix A5 |
| BLOCKED | human phones (same as the rest of the field track) |
| PRODUCTION | wiring only until Evidence Pack |
| FINAL VERDICT | **NO** |
