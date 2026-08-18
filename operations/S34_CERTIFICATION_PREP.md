# S34 — Product certification prep

**Status:** WIRED (public-surface prep) · Evidence Pack **NOT STARTED**  
**Date:** 2026-08-18  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/  
**PRODUCT PROTOCOL READY:** **NO**  
**S35:** `PRODUCT_PROTOCOL_V2_ENABLED=false` — unchanged.  
**Living Map:** stays **off** by default. No Living Map feature expansion.  
**Native / TestFlight:** not started.  
**Push credentials:** not invented; web push stays fail-closed.

Original S34 (live multi-day cohort) remains **OPEN** until two real phones complete
[`EVIDENCE_PACK_TWO_PHONE.md`](./EVIDENCE_PACK_TWO_PHONE.md). This sprint only closes wiring that would confuse a
tester who receives **only** the public URL.

## What this sprint covers

1. **Public-surface hygiene** — default Radar path has no QA chips, no fake Pulse city list, no Destiny card, no
   Signal tab. Bottom tabs are Radar / Discover / Pulse / Me. Language lives in **Me**.
2. **Mission ticket V3.1** — FREE hold ≤ 2 hours, Wingman+ hold ≤ 24 hours, from **server** `expiresAt` /
   `remainingMs`. Client countdown uses that instant, not a local `2:00:00`. Survives tab hide/show (S32 restore).
   No fake Plus entitlement or checkout.
3. **Anti-contact** — Mission chat still uses the existing domain filter. UI shows human EN/FR copy
   (`t_blocked`). GET messages redacts `[filtered]`.
4. **Outcome + cooldown** — each person records only their own outcome. Cooldown starts when **both** have answered
   (server). Remaining cooldown is server `remainingMs`. Human waiting copy while the other person has not answered.
5. **Evidence Pack labels** aligned with current UI (Radar / Discover / Pulse / Me, **Report & block**, approximate
   location, foreground heartbeat).

Do **not** rewrite engines. Do **not** set PRODUCT PROTOCOL READY = YES.

## Public surface (tester sees)

| Item | Behaviour |
|------|-----------|
| URL | `https://wingman-prototype.vercel.app/` only — no `?api=`, `?qa=1`, `?livingMap=1` |
| Top chrome | Hidden on hosted field-test (`body.field-test`) |
| Fake status-bar times / mood shape hints | Hidden on field-test |
| Pulse | Live aggregate or quiet copy. Luxembourg demo list is `qa-only`. No `peopleActive` codes. |
| Destiny | Card forced hidden on the public product path |
| Signal | Inbox on Radar, not a permanent tab |

## Ticket remaining time

`GET /connections/:id` now returns `serverTime` + `remainingMs` next to `connection.expiresAt`.

- After mutual approval, remaining is the existing mission window until the user taps **Later** (`hold_ticket`).
- **Later** sets `TICKET_ACTIVE` with `ticketMaxDurationMs` (FREE 2h / Plus 24h from entitlements).
- Client `makeTimer({ expiresAtMs })` renders `remainingMs` / `expiresAt` via `state.serverNow()`.
- Plan copy: FREE “up to 2 hours”; Plus “up to 24 hours” only when `GET /billing/entitlements` says `WINGMAN_PLUS`.
  Checkout stays disabled (`503`).

## Tests

```bash
node --test prototype/protocol-client.regression.test.mjs prototype/i18n-parity.test.mjs
pnpm --filter @wingman/domain test -- src/engines.s4-s7.test.ts
pnpm --filter @wingman/api test -- src/s34.certification-prep.test.ts
```

## Verdict

| Item | Status |
|------|--------|
| Public-surface hygiene | **WIRED** |
| Ticket remaining from server | **WIRED** |
| Anti-contact human copy | **WIRED** |
| Own outcome + durable cooldown | **WIRED** |
| Evidence Pack labels | **ALIGNED** (rows still blank) |
| Two-phone Evidence Pack | **NOT STARTED / BLOCKED** (human phones) |
| PRODUCT PROTOCOL READY | **NO** |
| S34 live certification (5–10 testers) | **OPEN** |
