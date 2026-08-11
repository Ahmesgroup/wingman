# S23 — Destiny V2

**Status:** Implemented · Feature flags below  
**Package:** `@wingman/destiny-v2`  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S22_CONTEXT_ENGINE.md`](./S22_CONTEXT_ENGINE.md)

## Rule

Destiny V2 detects a **rare contextual convergence**, then requires **separate consent from both people**. It never auto-matches and never invents a parallel connection path.

```text
V1 eligibility
      ↓
Context Engine S22
      ↓
Destiny Candidate Engine
      ↓
Destiny Policy (rarity / cooldown)
      ↓
DESTINY_PROPOSAL
   ↙           ↘
consent A     consent B
   ↘           ↙
 mutual consent
       ↓
existing V1 Signal → Connection flow
```

## Four blocks

| Bloc | Role | Gate |
|------|------|------|
| **1. Candidate Engine** | Score rare convergence from V1-eligible pairs + S22 context | No candidate outside V1 eligibility |
| **2. Destiny Policy** | Threshold, rarity %, cooldowns, max 1 simultaneous proposal | No farming / repetition |
| **3. Mutual Consent** | Separate accept/decline; states `PROPOSED` → `A_ACCEPTED` / `B_ACCEPTED` → `MUTUAL` | No connection without double consent |
| **4. Reliability & Audit** | Ephemeral accept lock, expiry, invalidate on block, internal reasons | One Destiny outcome per pair/window |

## Flags

| Env | Effect |
|-----|--------|
| `DESTINY_V2_ENABLED` unset/false | Destiny **V1** path bit-for-bit (`noteCopresence` + `tryDestinyPrompt`) |
| `DESTINY_V2_ENABLED=true` | Candidate + policy engine |
| `DESTINY_V2_PROPOSALS_ENABLED=false` (with V2 on) | **Shadow mode** — compute metrics/`shadowDecisionId`, no user proposals |
| `DESTINY_V2_PROPOSALS_ENABLED=true` | Live proposals + consent endpoints |
| `DESTINY_V2_RARITY_PERCENT` | 0–100 (default `35` in Nest) |
| `DESTINY_V2_MIN_SCORE` | Internal threshold (default `0.72`) |

## Privacy

Public message only:

> Une convergence inhabituelle vient d'être détectée.

Score, reasons, distance, language, and context stay server/audit — never on public HTTP bodies.

## HTTP

| Method | Path | Notes |
|--------|------|-------|
| POST | `/destiny/copresence` | V1 or V2 depending on flags |
| GET | `/destiny/proposals` | Open/mutual public proposals for caller |
| POST | `/destiny/proposals/:id/accept` | Consent; on `MUTUAL` → `SignalsService` DESTINY signal → open → accept |
| POST | `/destiny/proposals/:id/decline` | Declines; starts rejection cooldown |

## Architecture

```text
                V1 Core
                   │
             eligible set
                   │
                   ▼
             Context S22
                   │
                   ▼
             Destiny V2
           candidate + policy
                   │
             proposal only
                   │
             A + B consent
                   │
                   ▼
       Existing SignalsService (V1)
                   │
                   ▼
                V1 Core
```

- `@wingman/domain` must **not** import `@wingman/destiny-v2`.
- No `DestinyConnectionService` duplicating connection rules.

## Persistence note (S23 → S24.1)

Proposal store is multi-instance capable via `DestinyProposalStore` (memory or Redis). See [`S24.1_DESTINY_PROPOSAL_PERSISTENCE.md`](./S24.1_DESTINY_PROPOSAL_PERSISTENCE.md). Concurrent accept uses ephemeral locks (`destiny-accept:{id}`) so multi-instance Nest does not double-handoff to Connection.

## Gates

Verified by `packages/destiny-v2` unit tests and `apps/api/src/s23.destiny-v2.test.ts`:

- Candidate never outside V1 eligibility
- Missing context = neutral
- Flag OFF = Destiny V1 behavior
- Shadow mode = no user-visible proposal
- No auto-match; double consent required
- Decline / expiry / block invalidate prevent connection
- Score/reasons absent from public responses
- Domain package has no `@wingman/destiny-v2` import

## Next

→ **Done:** [`S24.1_DESTINY_PROPOSAL_PERSISTENCE.md`](./S24.1_DESTINY_PROPOSAL_PERSISTENCE.md). Optional: staging Redis/Postgres load tests; auto-learning after S26 baselines.
