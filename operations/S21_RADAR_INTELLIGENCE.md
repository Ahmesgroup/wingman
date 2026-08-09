# S21 — Radar Intelligence

**Status:** Implemented · Feature flag: `RADAR_INTELLIGENCE_ENABLED=true`  
**Package:** `@wingman/radar-intelligence`  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md)

## Rule

```text
eligible candidates (V1)
        ↓
hard filters V1 (unchanged)
        ↓
context features (server enrichment)
        ↓
ranking policy
        ↓
ordered radar (same set)
```

- **V1** remains the authority for *who* is eligible.
- **S21** only reorders. Disabling the flag restores exact V1 order.
- Scores and reasons are **internal** (audit via `RadarService.getLastRankingAudit()`). Clients never see `score`.

## Allowed signals

| Signal | Reason code |
|--------|-------------|
| Distance bucket NEAR/AROUND | `nearby` / `around` |
| Presence freshness | `recently_available` |
| Shared language hints | `shared_language` |
| Mood/intention present | `context_compatible` |
| Recent pair interaction | `recent_interaction` (slight demotion) |
| Over-exposure without success | `recent_unsuccessful_exposure` / `diversity_rotation` |

## Forbidden

Beauty, social popularity, match counts, wealth, engagement-addiction scores.

## Flag

| Env | Effect |
|-----|--------|
| unset / not `true` | V1 order only |
| `RADAR_INTELLIGENCE_ENABLED=true` | Contextual ephemeral ranking |

## Gates

```bash
pnpm --filter @wingman/radar-intelligence test
pnpm --filter @wingman/api test -- src/s21.radar-intelligence.test.ts
```

- Same candidate userId set as V1
- Flag off ≡ V1 order
- Blocked users never appear (eligibility still V1)
- Response JSON has no `score`, no lat/lng

## S22 next

Move language / time / mobility hints into a dedicated **Context Engine**; Radar Intelligence consumes normalized context only.

→ **Done:** see [`S22_CONTEXT_ENGINE.md`](./S22_CONTEXT_ENGINE.md). Next: **S23 Destiny V2**.
