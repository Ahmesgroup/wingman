# Project state — locked 2026-08-11

**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S26_MEASUREMENT.md`](./S26_MEASUREMENT.md), [`STAGING_LOAD_CERTIFICATION.md`](./STAGING_LOAD_CERTIFICATION.md)

```text
S0–S20    Backend V1                FROZEN / GO
S21       Radar Intelligence        DONE
S22       Context Engine            DONE
S23       Destiny V2                DONE
S24       Anti-Abuse                DONE
S24.1     Destiny Multi-instance    DONE
S25       Geo Intelligence          DONE
S26       Measurement v1.2.0        DONE (instrumentation)
LEARNING                            OFF
MEASUREMENT                         ON  (collect real traffic)
NEXT                                REAL BASELINE COLLECTION
THEN                                S26 Review (not automatic S27)
```

## Operating mode now

| Flag | Value | Meaning |
|------|-------|---------|
| `MEASUREMENT_ENABLED` | `true` | Observe decisions/outcomes; serve `/internal/measurement/report` |
| `MEASUREMENT_LEARNING_ENABLED` | `false` | Forbidden to turn on until after S26 Review |

Measurement **observes; it never decides**. No metric feeds back into S21–S25.

## Baseline dimensions (no single North Star)

Collect enough real traffic to read **four dimensions together**:

| Dimension | Proxies |
|-----------|---------|
| **Quality** | Signal→Connection, mutual→Mission, Mission→completed, time-to-signal, Destiny acceptance |
| **Safety** | Blocks, abuse sanctions, restrictions after interaction |
| **Diversity / rotation** | Repeat exposure rate |
| **Contextual resilience** | Context/geo fallback share |

Do **not** optimize a single metric. `Signal→Connection` alone can make ranking aggressive; `Mission→completed` alone can favor the same profiles.

## After enough data → S26 Review (required)

**S26 Review is not a new product engine.** It is an evidence gate before any adaptive work.

Compare V1 vs V1.1 and answer:

1. Does contextual ranking raise completed encounters **without** raising blocks / repeat exposure?
2. Does Destiny add rare mutual value, or noise?
3. Are there undesirable correlations (e.g. more Signals, worse safety/diversity)?
4. Do context/geo fallbacks stay rare enough that policies are trustworthy?

Then choose **exactly one**:

| Option | When |
|--------|------|
| **A. Change nothing** | Engines already improve human encounters within guardrails |
| **B. Manual policy tune** | Adjust S21–S25 thresholds/flags from evidence (still no learning loop) |
| **C. S27 Adaptive Engine** | Only if data justify controlled adaptation — never as the default next sprint |

## Principle

Wingman now has enough engines. The next advantage is knowing whether they **improve real human encounters** — not shipping another engine by habit.
