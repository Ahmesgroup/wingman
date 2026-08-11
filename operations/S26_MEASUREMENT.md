# S26 — Measurement & Engine Audit

**Status:** Implemented · Baselines complete (v1.2.0) · Feature flags below  
**Package:** `@wingman/measurement`  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`STAGING_LOAD_CERTIFICATION.md`](./STAGING_LOAD_CERTIFICATION.md)

## Rule

> **Measure and audit first. Do not auto-learn.**  
> **Measurement observes; it never decides.** No metric feeds back into S21–S25 engines.  
> Learning stays off until real baselines exist and we know which metrics mean better encounters — not just more engagement.

```text
Radar / Context / Destiny / Anti-Abuse / Geo / Signal / Connection / Safety
                          ↓
                 Measurement Observation (Nest only)
                          ↓
            Decision audit + Outcome events
                          ↓
                 Aggregate report (internal)
                          ✕ no feedback into engines
```

## Blocks

| Bloc | Goal | Gate |
|------|------|------|
| **1. Decision audit** | Named reasons, engine version, flag snapshot | No opaque lone score as sole justification |
| **2. Outcome tracking** | Funnel + safety + geo + baselines | Correlatable counters |
| **3. Aggregation** | Quality / safety / geo / baselines | Deterministic, reversible (flags in report) |
| **4. Privacy** | Hash actor keys; strip lat/lng/phone | Report safe for internal HTTP |
| **5. Learning lock** | Learning switch forbidden | `MEASUREMENT_LEARNING_ENABLED=true` refused |

## Flags

| Env | Effect |
|-----|--------|
| `MEASUREMENT_ENABLED` unset/false | No observation; `GET /internal/measurement/report` → `{ enabled: false }` |
| `MEASUREMENT_ENABLED=true` | Record decisions/outcomes; serve aggregates |
| `MEASUREMENT_LEARNING_ENABLED=true` | **Forbidden** — engine construction throws |

## Baseline metrics (locked)

| Metric | Outcome / aggregate |
|--------|---------------------|
| Mutual → Mission | `mission.entered` · `baselines.connectionToMissionRate` |
| Mission → completed encounter | `mission.completed` (COOLDOWN after dual outcome / COMPLETED skip) · `baselines.missionCompletionRate` |
| Time-to-signal | `signal.created.meta.latencyMs` from last radar impression · `baselines.timeToSignal` p50/p95 |
| Repeat exposure | `radar.repeat_exposure` · `baselines.repeatExposureRate` |
| Destiny acceptance rate | `destiny.mutual / destiny.proposed` · `baselines.destinyAcceptanceRate` (+ `destiny.accept` first consent) |
| Fallback context/geo | `context.fallback` / `geo.fallback` · `baselines.fallbackShare` |

Every advanced decision still carries `engine`, `version`, `decisionId`, reasons, timestamp + flag snapshot.

## Report shape (internal)

`GET /internal/measurement/report?from=&to=`

```json
{
  "learningEnabled": false,
  "measurementVersion": "1.2.0",
  "quality": { "signalsCreated": 10, "connectionsOpened": 3, "signalToConnectionRate": 0.3 },
  "safety": { "blocksIssued": 1, "abuseEnforced": 0, "blocksPerSignal": 0.1 },
  "geo": { "ingests": 20, "highDensityShare": 0.25 },
  "baselines": {
    "missionEntered": 2,
    "missionCompleted": 1,
    "connectionToMissionRate": 0.67,
    "missionCompletionRate": 0.5,
    "timeToSignal": { "samples": 8, "p50Ms": 1400, "p95Ms": 5200 },
    "repeatExposures": 3,
    "repeatExposureRate": 0.3,
    "destinyAccepts": 4,
    "destinyAcceptanceRate": 0.25,
    "contextFallbacks": 5,
    "geoFallbacks": 2,
    "fallbackShare": 0.4
  },
  "byEngine": { "RADAR_RANKING": { "decisions": 5 } },
  "flagsSeen": { "MEASUREMENT_LEARNING_ENABLED": false }
}
```

Never includes exact coordinates, cell ids, phones, or message bodies.

## Architecture

- Package `@wingman/measurement` is pure (store + aggregate).
- Nest `MeasurementGate` observes only — Radar, Signal, Connection/Mission, Destiny, Anti-Abuse, Geo, Safety.
- Domain must **not** import `@wingman/measurement`.
- Engines S21–S25 business rules unchanged when measurement is on or off.

## Gates

Verified by package tests + `apps/api/src/s26.measurement.test.ts`:

- Flag OFF = no user/protocol change; report disabled
- Flag ON = aggregates + baselines populate; Signal path still works
- Learning flag refused at package construction
- Report contains no lat/lng / phone / selfie
- Domain has no `@wingman/measurement` import

## Out of scope

- Auto-learning / model updates (S27 decision only after baseline collection)
- Feeding metrics back into ranking / Destiny / geo

## Next

**NOW:** real baseline collection (`MEASUREMENT_ENABLED=true`, learning off) across quality / safety / diversity / contextual resilience — no single North Star.

**THEN:** **S26 Review** (evidence gate) → A no change · B manual policy tune · C S27 Adaptive only if justified.

Board: [`PROJECT_STATE.md`](./PROJECT_STATE.md).
