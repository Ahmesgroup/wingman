# Client Polish Review — real-phone verdict

**Status:** OPEN — next action (no code sprint)  
**Implements closed:** P1–P4 (`bb9bb13`) — polish *implementation* phase done  
**Forbidden:** engines (S27+), `PAYMENTS_ENABLED=true`, domain/architecture refactors, **P5 by habit**

## Sequence (locked)

```text
Client Polish Review (real phone)
        │
        ├─► FREEZE client V1     if loop is fluid & clear
        └─► P5 targeted only     if review lists reproducible defects
```

No P5 “par principe”. Hypotheses do not open tickets.

## Verdict rule (simple)

| Verdict | When | Next |
|---------|------|------|
| **FREEZE V1** | Full loop stays fluid and clear on a real device; no blocking defect from the list below | Document freeze; stop client polish |
| **P5 ciblé** | Review produces **reproducible** defects (device, OS, steps, expected vs actual) | Scoped polish tickets only — still no engines/payments |

### Defect classes that can justify P5 (examples)

- Overflow / clipped UI on real viewport
- Keyboard masking a primary CTA
- Insufficient contrast / unreadable in motion
- Confusing reconnect / offline recovery
- Ambiguous protocol state (Signal / Match / Mission / Cooldown)
- Perceptible UI latency that breaks trust
- Inaccessible interaction (touch, focus, SR)

Smoke (`Smoke P4` / `?smoke=1`) is **necessary but not sufficient** — this review catches fluidity, state comprehension, real touch size, and readability in motion.

## Real-device observation protocol

Record **device / OS / browser** once, then walk:

1. **Cold start** — launch → Splash readable, primary CTA obvious  
2. **Auth** — phone → OTP → profile → consent (no dead screen)  
3. **Radar** — invisible → go active; mood meaning without color alone  
4. **Signal** — send / receive; feedback immediate and blue-coded  
5. **Validation** — selfie / pending; timer + actions clear  
6. **Match** — Connection confirmed → ticket (not ambiguous with Mission)  
7. **Mission** — Meet + Mode; only active mission may “breathe”  
8. **Outcome** — private answer; advance works  
9. **Cooldown** — calm; back to Radar  
10. **Refresh** mid-loop — coherent restore (no mute / wrong phase)  
11. **Offline → reconnect** — banner + CTA; usable again  
12. **Rotation** — landscape / return; no trapped CTA  
13. **Background → foreground** — app usable; no infinite spinner  

Also note: reduced-motion path if the tester enables it.

## Entry criteria

- [x] P1–P4 checklists in [`CLIENT_POLISH.md`](./CLIENT_POLISH.md)  
- [x] Prototype smoke passes in mock mode  
- [ ] Review session completed on at least one real phone  

## Review log (fill on device)

| Field | Value |
|-------|--------|
| Date | |
| Device | |
| OS / browser | |
| Tester | |
| Verdict | `FREEZE V1` / `P5` |
| Evidence (links / notes) | |

### Checklist

- [ ] Cold start → Cooldown → Radar fluid end-to-end  
- [ ] Protocol states immediately understandable (not color-only)  
- [ ] Touch targets feel usable in hand (not only CSS ≥44)  
- [ ] Refresh mid-loop coherent  
- [ ] Offline / reconnect clear  
- [ ] Rotation + background resume OK  
- [ ] Keyboard does not hide primary CTA  
- [ ] No infinite spinner / dead screen  

### Reproducible findings (P5 candidates only)

| ID | Observation (repro steps) | Severity | Opens P5? |
|----|---------------------------|----------|-----------|
| | | | Y/N |

## After verdict

- **FREEZE V1** → update [`PROJECT_STATE.md`](./PROJECT_STATE.md) client line to frozen; no further polish sprint unless new objectified evidence.  
- **P5** → open only tickets tied to rows above; keep scope polish-only.
