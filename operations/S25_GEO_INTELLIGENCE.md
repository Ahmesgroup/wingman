# S25 — Geo Intelligence

**Status:** Implemented · Feature flags below  
**Package:** `@wingman/geo-intelligence`  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S22_CONTEXT_ENGINE.md`](./S22_CONTEXT_ENGINE.md), [`S21_RADAR_INTELLIGENCE.md`](./S21_RADAR_INTELLIGENCE.md)

## Rule

> The phone knows the precise position. The backend retains only what is needed to decide “close enough / same zone / same context”, with short TTL and reduced precision.

```text
Device lat/lng
    ↓
Geo Adapter (Nest Radar activate/heartbeat)
    ↓
Geo Normalizer (quantize + opaque cell)
    ↓
Ephemeral Spatial Snapshot
    ├─ spatialCell
    ├─ density
    ├─ freshness
    ├─ movement (session only)
    └─ confidence
          ↓
     Context Engine S22 (mobility)
          ↓
 Radar Intelligence S21 (same_spatial_cell ranking)
          ↓
      Destiny V2 (optional band via GeoContextPort)
```

**No business engine reads `latitude` / `longitude`.** Radar, Destiny, Anti-Abuse, and domain consume `GeoContextPort` (bands / cells / classes only).

## Five blocks

| Bloc | Goal | Gate |
|------|------|------|
| **1. Geo Normalize** | Raw lat/lng → temporary spatial bucket | No exact coords outside adapter |
| **2. Adaptive Radius** | Density/context-aware radius *recommendations* | Not a universal fixed sense of “near” |
| **3. Geo Freshness** | TTL, movement, stale data | Expired / gap → ignore previous (no ghost) |
| **4. Privacy Layer** | Quantize, opaque cell, no trajectory list | Hard to reconstruct a path |
| **5. Radar Integration** | Features for S21/S22 | Same V1 eligibility; ranking/context only |

## Public consumer shape

```json
{
  "distanceBand": "NEAR",
  "spatialCell": "cell_xxx",
  "density": "HIGH",
  "freshness": "FRESH",
  "movement": "STATIONARY"
}
```

Never:

```json
{ "lat": 49.612345, "lng": 6.131234, "distanceMeters": 23.71 }
```

Exact meters may exist briefly inside the geo adapter for banding / anti-abuse delta; they are not logged, persisted as history, or returned on HTTP.

## Adaptive radius (S25)

Recommendations only (`recommendedNearM` / `recommendedAroundM` when `GEO_ADAPTIVE_RADIUS_ENABLED=true`):

- Dense → tighter
- Sparse → wider
- Fast-moving → shortened around
- Stale → slightly reduced

**V1 `getCandidates(near, around)` radii are unchanged in S25.** Using adaptive radii for eligibility requires a later sprint with new gates.

## Movement

`STATIONARY` / `WALKING` / `FAST_MOVING` are **session ephemeral states**, never durable user traits. Context Engine may map them to mobility hints for the current session only.

## Flags

| Env | Effect |
|-----|--------|
| `GEO_INTELLIGENCE_ENABLED` unset/false | Geographic V1 path (no Geo ingest/port) |
| `GEO_INTELLIGENCE_ENABLED=true` | Normalize + freshness + `GeoContextPort` |
| `GEO_ADAPTIVE_RADIUS_ENABLED=true` | Attach adaptive radius recommendations |

## Persistence

`MemoryGeoSnapshotStore` — one current snapshot per user (no trajectory array). Multi-instance: share store (tests) or future Redis adapter. Presence hydrate still requires client re-activate.

## Gates

Verified by `packages/geo-intelligence` and `apps/api/src/s25.geo-intelligence.test.ts`:

- No exact coordinates in HTTP candidate/activate bodies
- Expired snapshot ignored
- Shared store = multi-instance coherence
- Fast gap does not create ghost movement from stale prev
- Flag OFF = previous behavior
- Same input → same cell
- Geo cannot add users outside V1 eligibility
- Block/safety still dominates
- Domain does not import `@wingman/geo-intelligence`

## Out of scope

**S24.1 Destiny Proposal Persistence** remains a separate follow-up.

## Next

**S26 Measurement & Engine Audit** — prove S21–S25 improve encounter quality without increasing blocks, abuse, or geographic exposure.
