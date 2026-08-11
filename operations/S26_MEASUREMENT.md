# S26 — Measurement & Engine Audit

**Status:** Implemented · Feature flags below  
**Package:** `@wingman/measurement`  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S25_GEO_INTELLIGENCE.md`](./S25_GEO_INTELLIGENCE.md)

## Rule

> **Measure and audit first. Do not auto-learn.**  
> S26 records V1.1 engine decisions and outcomes so quality, safety, and geo exposure can be compared — without changing business rules and without training models.

```text
Radar / Context / Destiny / Anti-Abuse / Geo / Signal / Safety
                          ↓
                 Measurement Observation
                          ↓
            Decision audit + Outcome events
                          ↓
                 Aggregate report (internal)
```

## Blocks

| Bloc | Goal | Gate |
|------|------|------|
| **1. Decision audit** | Named reasons, engine version, flag snapshot | No opaque lone score as sole justification |
| **2. Outcome tracking** | Signals, connections, blocks, abuse, destiny, geo | Correlatable counters |
| **3. Aggregation** | Quality / safety / geo exposure proxies | Deterministic, reversible (flags in report) |
| **4. Privacy** | Hash actor keys; strip lat/lng/phone | Report safe for internal HTTP |
| **5. Learning lock** | Learning switch forbidden | `MEASUREMENT_LEARNING_ENABLED=true` refused |

## Flags

| Env | Effect |
|-----|--------|
| `MEASUREMENT_ENABLED` unset/false | No observation; `GET /internal/measurement/report` → `{ enabled: false }` |
| `MEASUREMENT_ENABLED=true` | Record decisions/outcomes; serve aggregates |
| `MEASUREMENT_LEARNING_ENABLED=true` | **Forbidden in S26** — engine construction throws |

## Report shape (internal)

`GET /internal/measurement/report?from=&to=`

```json
{
  "learningEnabled": false,
  "quality": { "signalsCreated": 10, "connectionsOpened": 3, "signalToConnectionRate": 0.3 },
  "safety": { "blocksIssued": 1, "abuseEnforced": 0, "blocksPerSignal": 0.1 },
  "geo": { "ingests": 20, "highDensityShare": 0.25 },
  "byEngine": { "RADAR_RANKING": { "decisions": 5 } },
  "flagsSeen": { "RADAR_INTELLIGENCE_ENABLED": true, "MEASUREMENT_LEARNING_ENABLED": false }
}
```

Never includes exact coordinates, cell ids, phones, or message bodies.

## Architecture

- Package `@wingman/measurement` is pure (store + aggregate).
- Nest `MeasurementGate` hooks Radar ranking, Signal create/accept, Safety block, Destiny evaluate/mutual, Anti-Abuse decisions, Geo ingest.
- Domain must **not** import `@wingman/measurement`.
- Engines S21–S25 business rules unchanged when measurement is on or off.

## Gates

Verified by package tests + `apps/api/src/s26.measurement.test.ts`:

- Flag OFF = no user/protocol change; report disabled
- Flag ON = aggregates populate; Signal path still works
- Learning flag refused at package construction
- Report contains no lat/lng / phone / selfie
- Domain has no `@wingman/measurement` import

## Out of scope

- Auto-learning / model updates (S26+)
- S24.1 Destiny proposal persistence

## Next

**Locked:** staging load certification (Redis/Postgres) → S26 baseline campaign (learning off) → decision on S27. See [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md). No auto-learning until baselines close the metric gaps listed there.
