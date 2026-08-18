# S29 — Real multi-user realtime

**Status:** WIRED (realtime) · Evidence Pack **NOT STARTED** (two human phones)  
**Date:** 2026-08-18  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/  
**PRODUCT PROTOCOL READY:** **NO**  
**S35:** `PRODUCT_PROTOCOL_V2_ENABLED=false` — unchanged.  
**Living Map:** stays **off** by default. No Living Map feature expansion.  
**Native / TestFlight:** not started.  
**Push credentials:** not invented; closed-app Signal still S32.

## Goal

A and B use the same public site. When A sends a Signal, B receives it **without refresh**, DB hack, or developer help. Same for Radar appearance/disappearance, Mutual, Mission chat both ways, and block.

## Gaps closed this sprint

1. **Signal received** — existing `signal.received` on `user:{receiver}`. Public client binds badge, inbox card, Signal row, EN/FR toast (`t_signal_received`), and a11y announce to that event.
2. **Radar** — sockets that connect **before** Go active now join the radar zone room when presence is noted. `radar.changed` is emitted on appear / leave / move **and on block** (this was missing; Living Map and canvas both waited for the next poll). Same-zone heartbeat **does not** re-broadcast, so clients are not forced to refetch every ~40s.
3. **Mission chat** — A→B and B→A on `mission.message` (user + connection + mission rooms). Reconnect restores via `GET /connections/:id/messages`. Third user 404 / WS `FORBIDDEN`.
4. **No poll spam** — client debounces Radar refetch (~280ms) on `radar.changed` / `presence.changed` for canvas **and** Living Map.

## Tests

```bash
node --test prototype/protocol-client.regression.test.mjs prototype/i18n-parity.test.mjs
pnpm --filter @wingman/api test -- src/s29.realtime.e2e.test.ts src/dual-session.auth.e2e.test.ts src/ws.e2e.test.ts src/mission.message.realtime.test.ts
```

Covered: signal push to the other session; `radar.changed` when a peer appears after WS-first (product order); `radar.changed` on block; heartbeat does not emit `radar.changed`; chat both directions; reconnect history; third user denied.

## Live QA

Cannot complete two phones in this sprint. Do **not** mark the Evidence Pack or field path GREEN.

## BLOCKED / OPEN

| Item | Status |
|------|--------|
| Realtime wire (same site, no refresh) | **WIRED** |
| Two-phone Evidence Pack | **NOT STARTED** |
| PRODUCT PROTOCOL READY | **NO** |
| Closed-app / web push | **BLOCKED** (credentials — S32) |
| Native / TestFlight | **not started** |

## Verdict

| Item | Status |
|------|--------|
| GREEN | no — Evidence Pack not run |
| FIXED | block→`radar.changed`; WS-first radar room join; heartbeat skip; canvas debounce; Signal toast bind |
| OPEN | two-phone Evidence Pack |
| BLOCKED | human phones (same as the rest of the field track) |
| PRODUCTION | wiring only until Evidence Pack |
| FINAL VERDICT | **NO** |
