# S44 — Living Map as primary surface

**Status:** IMPLEMENTED (UI representation) · **PRODUCT PROTOCOL READY = NO**  
**Owner override:** Living Map is allowed as the default main experience before the two-phone Evidence Pack. The Evidence Pack remains a separate gate and is **NOT STARTED**.  
**Public URL:** https://wingman-prototype.vercel.app/  
**Rollback:** `WINGMAN_LIVING_MAP_V1=false` (everyone) or `?radar=canvas` (one tester). Canvas Radar stays in the tree.

## What this is

Users enter the Wingman world. The map is the permanent terrain. Radar, Discover, Pulse, and Destiny are **layers** on that terrain. Signal → Selfie → Mutual → Mission stay the existing protocol screens (overlays above the map), not a second Radar.

The map is a **new representation of server truth**. Eligibility, presence, ranking, Signal, Destiny, tickets, cooldown, and state machines are unchanged.

## Real data (no fake fill)

| Layer | Source | Empty rule |
|-------|--------|------------|
| Radar | `GET /radar/opportunities` (same eligibility as `GET /radar/candidates`) | 0 eligible → 0 markers |
| Discover | Same authorized set, exploration tray on the **same** map | No profile catalogue; no invented people |
| Pulse | `GET /radar/pulse` aggregates + client zones only when a bucket meets the privacy threshold (5) | Below threshold → quiet; never a 1-person blob |
| Destiny | `destiny: true` on a real opportunity | Banner only if a real Destiny opportunity exists |

Privacy: payloads never include peer `lat`/`lng`. Markers are coarse `distanceBand` + `bearingBucket` around the viewer. Pulse does not reveal precise movement history.

## Visual language (global polish)

Dark desaturated Carto `dark_nolabels` terrain, translucent (not frosted) overlays, progressive disclosure. Mood is behind presence tap. Discover tray is two rows. Pulse privacy sits in `<details>`. Canvas Radar remains rollback until real-device review — not a second product.

**PRODUCT PROTOCOL READY stays NO** until the two-phone Evidence Pack.

## Default vs rollback

| Path | Surface |
|------|---------|
| Public product (flag unset or not `"false"`) | Living Map |
| `WINGMAN_LIVING_MAP_V1=false` | Canvas Radar for everyone |
| `?radar=canvas` | Canvas Radar for that tester |
| `?livingMap=1` | Legacy force-on (not required) |

## Protocol

Exit gate is still one protocol:

Map background → real presence → real candidates → filters → Signal → Selfie → Mutual → Mission → Outcome → Cooldown

**PRODUCT PROTOCOL READY stays NO** until the two-phone Evidence Pack.

## Tests

```text
node --test prototype/living-map.test.mjs prototype/i18n-parity.test.mjs prototype/protocol-client.regression.test.mjs
pnpm --filter @wingman/radar-intelligence test
pnpm --filter @wingman/api exec vitest run src/s44.living-map.test.ts
```
