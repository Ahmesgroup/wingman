# S24 — Anti-Abuse Engine

**Status:** Implemented · Feature flags below  
**Package:** `@wingman/anti-abuse`  
**Related:** [`V1.1_ADVANCED_ENGINE.md`](./V1.1_ADVANCED_ENGINE.md), [`S23_DESTINY_V2.md`](./S23_DESTINY_V2.md)

## Rule

> The engine **observes**, evaluates risk, then applies a **graduated policy**. It never modifies V1 / V1.1 business rules (Radar eligibility, Signal/Connection transitions, Destiny rarity, Mission).

```text
Radar events ─┐
Signal events ├──> Abuse Observation Layer
Destiny events┘
                    ↓
               Risk Signals (named)
                    ↓
                Risk Policy (versioned)
                    ↓
       allow / slow_down / cooldown
          / challenge / restrict / review
                    ↓
          Application enforcement (Nest only)
```

## Five blocks

| Bloc | Goal | Gate |
|------|------|------|
| **1. Observation** | Aggregate behavior without blocking | Shadow = no user effect |
| **2. Risk signals** | Named, explainable signals | No opaque score alone |
| **3. Policy** | Graduated deterministic action | Versioned (`policyVersion: 1.0`) |
| **4. Enforcement** | Cooldown / challenge / restrict at Nest | No bypass via other endpoints for same scope |
| **5. Audit & recovery** | Trace, expire, shared-store multi-instance | Sanctions expire; replay does not double-penalize |

## Actions

```text
ALLOW · SLOW_DOWN · COOLDOWN · CHALLENGE · TEMP_RESTRICT · REVIEW
```

`BLOCK` / `BAN` are reserved for human review or other certified security layers.

Example internal decision:

```json
{
  "signals": ["signal_burst", "high_target_diversity"],
  "riskLevel": "ELEVATED",
  "policyVersion": "1.0",
  "action": "COOLDOWN"
}
```

## Flags

| Env | Effect |
|-----|--------|
| `ANTI_ABUSE_ENABLED` unset/false | Zero observation / enforcement — S23 behavior exact |
| `ANTI_ABUSE_ENABLED=true` | Observe + evaluate |
| `ANTI_ABUSE_ENFORCEMENT_ENABLED=false` (with enabled) | **Shadow** — compute risks/actions, never sanction or block |
| `ANTI_ABUSE_ENFORCEMENT_ENABLED=true` | Write sanctions + Nest gates throw `ABUSE_*` |

## Scopes

| Scope | Typical action | Does not break |
|-------|----------------|----------------|
| `SIGNAL_CREATE` | COOLDOWN | Radar, Mission, Connection lifecycle |
| `RADAR_CANDIDATES` | SLOW_DOWN | Signal (unless ALL) |
| `DESTINY_ACTION` | COOLDOWN | Radar / Mission |
| `OTP_REQUEST` | CHALLENGE | — |
| `ALL` | TEMP_RESTRICT | — |

## Privacy

Abuse events never store exact `lat`/`lng`, phone numbers, or message bodies. OTP observation uses a hashed actor key. Public HTTP errors expose `action` + `expiresAt` + `policyVersion` only — not signal name lists.

## Persistence note

S24 uses an in-process / injectable `MemoryAbuseStateStore`. Multi-instance coherence is proven by **sharing the same store** across instances (tests). Redis-backed durable sanctions are a follow-up.

**Out of scope:** Destiny proposal persistence remains a separate follow-up (**S24.1**), not mixed into anti-abuse.

## Gates

Verified by `packages/anti-abuse` unit tests and `apps/api/src/s24.anti-abuse.test.ts`:

- Flag OFF = no abuse interference
- Shadow = zero user impact
- Replay same `eventId` = no double penalty
- Shared store = same cooldown across Nest instances
- Signal cooldown does not break Radar
- Real block observed immediately (`safety.block_received`)
- Sanctions expire
- No exact position / sensitive content in public errors
- `@wingman/domain` does not import `@wingman/anti-abuse`

## Next

**S25 Geo Intelligence** — smarter proximity without exposing exact location.  
Optional: **S24.1 Destiny Proposal Persistence**.
