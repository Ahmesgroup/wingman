# Client Polish Review — real-phone verdict

**Status:** OPEN — next action (no code sprint)  
**Client checkpoint before field validation:** `04e7c4d`  
**Implements closed:** P1–P4 (`bb9bb13`) — polish *implementation* done  
**Forbidden until verdict:** code changes from theoretical impressions; engines; payments; **P5 by habit**

## Boundary (locked)

```text
Smoke / P1–P4 tests     → prove the client works
Real-phone review       → prove it behaves as a product
Verdict                 → FREEZE V1  |  P5 closed correction list
```

No code change on “feels like” alone. No P5 as a new design phase.

## Sequence

```text
Client Polish Review @ 04e7c4d (real phone)
        │
        ├─► FREEZE V1     no significant defect blocks understanding, fluidity, or real use
        └─► P5 ciblé      closed list of reproducible defects only → fix sprint, not redesign
```

## Verdict (binary)

| Verdict | Rule | Next |
|---------|------|------|
| **FREEZE V1** | No significant defect prevents understanding, fluidity, or real-world use | Document freeze; stop polish |
| **P5 ciblé** | Review supplies concrete, reproducible defects | Closed correction sprint only (still no engines/payments) |

### Defect classes that can justify P5

- Overflow / clipped UI on real viewport  
- Keyboard masking a primary CTA  
- Insufficient contrast / unreadable in motion  
- Confusing reconnect / offline recovery  
- Ambiguous protocol state (Signal / Match / Mission / Cooldown)  
- Perceptible UI latency that breaks trust  
- Inaccessible interaction (touch, focus, SR)  

## Observation format (required for any finding)

Every finding that could open P5 **must** include:

| Field | Content |
|-------|---------|
| **Device** | model + OS |
| **Viewport** | CSS px / orientation (e.g. 390×844 portrait) |
| **Loop step** | cold start / auth / Radar / Signal / validation / Match / Mission / Outcome / Cooldown / refresh / offline / reconnect / rotation / background |
| **Expected** | what should happen |
| **Observed** | what happened (repro steps) |
| **Severity** | blocker / major / minor |

Impressions without this schema do **not** change code and do **not** open P5.

## Real-device walk

Record device / OS / browser once, then:

1. Cold start → Splash  
2. Auth (phone → OTP → profile → consent)  
3. Radar (invisible → active; mood not color-only)  
4. Signal  
5. Validation  
6. Match → ticket  
7. Mission (Meet + Mode)  
8. Outcome  
9. Cooldown → Radar  
10. Refresh mid-loop  
11. Offline → reconnect  
12. Rotation  
13. Background → foreground  

Also note reduced-motion if enabled.

## Entry criteria

- [x] P1–P4 done (`bb9bb13`)  
- [x] Docs checkpoint `04e7c4d`  
- [x] Smoke P4 passes in mock  
- [ ] Review completed on ≥1 real phone  

## Review log

| Field | Value |
|-------|--------|
| Date | |
| Device / OS / browser | |
| Checkpoint | `04e7c4d` |
| Tester | |
| Verdict | `FREEZE V1` / `P5` |

### Findings (P5 candidates — closed list if verdict = P5)

| ID | Device | Viewport | Loop step | Expected | Observed | Severity |
|----|--------|----------|-----------|----------|----------|----------|
| | | | | | | |

## After verdict

- **FREEZE V1** → mark client V1 frozen in [`PROJECT_STATE.md`](./PROJECT_STATE.md); no polish sprint without new objectified evidence.  
- **P5** → tickets = rows in the table above only; execute as correction list, then re-verify on device → FREEZE or residual minors accepted.
