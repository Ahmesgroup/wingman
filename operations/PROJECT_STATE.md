# Project state — locked 2026-08-11 · client track updated 2026-08-12

**Reference commit (engines / baseline):** `ccbb7a3`  
**Client track:** polish P1–P4 closed at `bb9bb13` · next = real-phone Client Polish Review  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S26_MEASUREMENT.md`](./S26_MEASUREMENT.md), [`STAGING_LOAD_CERTIFICATION.md`](./STAGING_LOAD_CERTIFICATION.md), [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md), [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md)

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
ENGINE SPRINTS                      STOPPED during baseline
NEXT (engines)                      REAL BASELINE COLLECTION
THEN                                S26 Review (not automatic S27)

CLIENT    Mobile-first + payments   DONE (payments DISABLED)
          Connection→Mission loop   DONE (wired to Nest)
PAYMENTS  Architecture ready        OFF (PAYMENTS_ENABLED=false)
CLIENT    Polish P1–P4 impl         DONE (`bb9bb13`)
CLIENT    Polish Review (phone)     OPEN → FREEZE V1 or P5 only if repro defects
```

## Freeze during baseline collection

Until **S26 Review** closes with an A/B/C decision:

- Do **not** open new advanced-engine sprints (no S27 by habit, no parallel “intelligence” packages).
- Do **not** turn `MEASUREMENT_LEARNING_ENABLED` on.
- Do **not** feed measurement outputs back into ranking / Destiny / geo / anti-abuse.
- Keep `MEASUREMENT_ENABLED=true` so the baseline stays continuous and **uncontaminated** by mid-flight engine changes.
- Do **not** enable payments (`PAYMENTS_ENABLED` stays `false`).

Bugfixes / infra / ops / **client polish** that do not change V1.1 decision logic remain allowed when objectified. **P5 is not automatic** — only after Client Polish Review lists reproducible defects.

## Client track

**Shipped:** [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md) — mobile-first + payment-ready disabled + loop wired.  
**Shipped:** [`CLIENT_POLISH.md`](./CLIENT_POLISH.md) — P1–P4 implementation closed.  
**Open:** [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md) — real-phone review → **FREEZE V1** or **P5 ciblé** (no P5 by principle).

- Web prototype is the mobile-first client against Nest (`AUTH_ALLOW_DEV` / `x-user-id`).
- S19 remains the **only** entitlement authority; client never self-promotes.
- Payments: `DisabledPaymentProvider` default — no real checkout until credentials + explicit enable.

## Operating mode now

| Flag | Value | Meaning |
|------|-------|---------|
| `MEASUREMENT_ENABLED` | `true` | Observe decisions/outcomes; serve `/internal/measurement/report` |
| `MEASUREMENT_LEARNING_ENABLED` | `false` | Forbidden to turn on until after S26 Review |
| `PAYMENTS_ENABLED` | `false` | No checkout / no real charges |
| `PAYMENT_PROVIDER` | `disabled` | Stripe/Paddle adapters present but OFF |

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

Wingman now has enough engines. The next advantage is knowing whether they **improve real human encounters** — not shipping another engine by habit. Stop engine sprints here; observe first. Client work may continue without reopening S0–S26.
