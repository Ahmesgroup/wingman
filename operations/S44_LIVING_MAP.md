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

## Map attribution (what must remain)

Visible control is `#lm-attrib` (Leaflet default prefix is **disabled**).

| Credit | Required? | Why |
|--------|-----------|-----|
| OpenStreetMap | **YES** | ODbL — required for any OSM-derived basemap |
| CARTO | **YES** | Carto basemap terms for `basemaps.cartocdn.com` (dark_nolabels) |
| Leaflet | Customary | BSD-2-Clause is satisfied in docs; a text link is kept. **Not** the Ukraine-flag SVG Leaflet 1.9 injects in `Control.Attribution` prefix (`leaflet-attribution-flag`, blue/yellow bars). That flag is **not** a license condition and is omitted. |

Do not re-enable Leaflet's default `attributionControl` prefix. Keep the three text links tappable and clear of the presence CTA / nav / safe-area.

## P0 actionability (marker → sheet → Signal)

Radar opportunities → privacy-safe markers (`candidateId` / `userId` opaque) → 44px hit target → compact sheet → existing `POST /signals`. Selfie remains the next protocol artefact after Signal/Connection — not merged into Signal.

## Say hello protocol handoff (this sprint)

**What “Say hello” / “Dire bonjour” does on Production:** it starts the canonical **V3.1** engine — `POST /signals` with opaque `receiverId`. It does **not** open the live camera, upload media, or bind a selfie.

| Step | Actor | Existing operation |
|------|--------|-------------------|
| 1 | A taps marker | compact sheet (`data-candidate-id` opaque) |
| 2 | A taps Say hello | `POST /signals` `{ receiverId, source: 'RADAR' }` |
| 3 | B | `signal.received` without refresh (S29) |
| 4 | B opens / accepts | Connection `WAITING_FOR_INITIATOR_SELFIE` (`match.created`) |
| 5 | A is led to `v-selfie` | live `getUserMedia` (existing selfie screen) |
| 6 | A sends photo | `POST /connections/:id/media` then `POST /connections/:id/selfie` |
| 7 | B selfie → A approves | existing Connection transitions → Mutual → Mission |

**“Selfie Signal” as camera-before-signal** remains **S35**, `PRODUCT_PROTOCOL_V2_ENABLED=false`, **OFF**. Human copy may say “Say hello” without changing API order. No Signal / selfie-media / Connection domain merge.

**PRODUCT PROTOCOL READY = NO.** Two-phone Evidence Pack = **NOT RUN**.

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
