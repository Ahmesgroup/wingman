# S22 — Context Engine

**Status:** Implemented · Feature flag: `CONTEXT_ENGINE_ENABLED=true`  
**Package:** `@wingman/context-engine`  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S21_RADAR_INTELLIGENCE.md`](./S21_RADAR_INTELLIGENCE.md)

## Rule

```text
raw user/activity hints
        ↓
Context Engine (normalize / confidence / TTL)
        ↓
normalized ephemeral context
        ↓
S21 Radar · S23 Destiny · S25 Geo
```

**Context Engine describes the situation. It never decides eligibility or final business outcomes.**

Missing or low-confidence fields are **omitted** (neutral) — never interpreted as incompatibility.

## Five families

| Family | Tier | Examples |
|--------|------|----------|
| Languages | stable | `fr`, `en` |
| Availability | ephemeral | `availabilityMinutes` |
| Mobility | ephemeral | `walking`, `stationary`, `transit` (never GPS) |
| Intention / mood | session | `social`, `open` |
| Freshness / recency | ephemeral | derived from presence TTL / heartbeat age |

## Snapshot shape (internal)

```json
{
  "userId": "u_123",
  "capturedAt": "2026-08-09T09:50:00.000Z",
  "expiresAt": "2026-08-09T10:10:00.000Z",
  "context": { "languages": ["fr", "en"], "availabilityMinutes": 25, "mobility": "walking" },
  "confidence": { "languages": 1.0, "availabilityMinutes": 0.9, "mobility": 0.7 },
  "engine": "CONTEXT_ENGINE",
  "version": "1.1.0"
}
```

Never contains exact `lat`/`lng`. Never returned on public HTTP candidate payloads.

## Flags

| Env | Effect |
|-----|--------|
| `CONTEXT_ENGINE_ENABLED` unset/false | S21 uses legacy language-hints path (exact S21 behavior) |
| `CONTEXT_ENGINE_ENABLED=true` | S21 consumes `RadarContextPort` adapted from Context Engine |
| `RADAR_INTELLIGENCE_ENABLED` | Still required for any ranking reorder |

## Ports

```text
Profile / Session / Presence / Device hints
                  │
                  ▼
          Context Inputs Port
                  │
                  ▼
            Context Engine
                  │
                  ▼
           Context Snapshot
                  │
                  ▼
         RadarContextPort (adapter)
                  │
                  ▼
              Radar S21
```

`@wingman/radar-intelligence` depends on **`RadarContextPort` only** — not on Context Engine implementation.

## Gates

```bash
pnpm --filter @wingman/context-engine test
pnpm --filter @wingman/api test -- src/s22.context-engine.test.ts
```

- Flag off ≡ S21 exact
- Flag on ≡ same candidate set as V1
- Expired context ignored
- Unknown context neutral
- No raw confidence / mobility / coordinates in HTTP
- Deterministic normalize(hints, now)
- Architecture: no context-engine import in domain or radar-intelligence package

## Next

**S23 Destiny V2** consumes the same normalized context instead of re-reading languages/time/mobility from multiple sources.
