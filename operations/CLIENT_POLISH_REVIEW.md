# Client Polish Review — after P1–P4

**Status:** Pending (do not open P5 automatically)  
**When:** After P4 gate is closed on a real phone  
**Forbidden during review:** engines (S27+), `PAYMENTS_ENABLED=true`, domain/architecture refactors

## Purpose

Objectify residual client quality before any freeze or optional P5:

1. Residual bugs (reproducible)
2. Visual coherence (`--proto-*` + mood language)
3. UX friction on the full loop
4. Accessibility (keyboard, SR, contrast, touch)
5. Stability on a real device (iOS/Android)

## Entry criteria

- P1–P4 checklists in [`CLIENT_POLISH.md`](./CLIENT_POLISH.md) are checked
- Prototype smoke (`Smoke P4` chip or `?smoke=1`) passes in mock mode
- Loop path exercised: Splash → Auth → Radar → Signal → Validation → Match → Mission → Outcome → Cooldown → Radar

## Decision outcomes (evidence before tickets)

| Outcome | Meaning | Next |
|---------|---------|------|
| **Freeze client V1** | Loop clean enough; no blocking a11y/UX defects | Document freeze; no P5 |
| **P5 (optional)** | Only if review lists objectified residual defects | Scoped polish tickets only — still no engines/payments |

Hypotheses do not open tickets. Measures / reproducible observations do.

## Review checklist (fill during review)

- [ ] Full loop on 360 / 375 / 390 / 412 without overflow or dead screens
- [ ] Offline → reconnect restores usable UI
- [ ] Refresh mid-loop restores a coherent view (session)
- [ ] Landscape / keyboard do not trap CTAs
- [ ] No primary action requires hover
- [ ] Mood / protocol meaning not by color alone
- [ ] Reduced-motion path fully usable
- [ ] Real-phone notes (device, OS, browser) attached
