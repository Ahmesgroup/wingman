# Client Polish Only — P1–P4

**Status:** Locked 2026-08-12 · Scope: UI/UX + client robustness only  
**Forbidden:** new engines (S27+), payment enablement, domain S0–S26 changes  
**Related:** [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md), [`PROJECT_STATE.md`](./PROJECT_STATE.md), [`../design/COLOR_SYSTEM.md`](../design/COLOR_SYSTEM.md)

## Scope lock

```text
NO  engines / S27 / learning
NO  PAYMENTS_ENABLED=true / checkout / Stripe|Paddle go-live
YES polish UI/UX until the full loop feels good on a real phone
```

## Sprints

| Sprint | Focus | Gate |
|--------|-------|------|
| **P1** | Responsive + structure | 360 / 375 / 390 / 412 px no overflow; correct safe-area; `100dvh`; mobile keyboard does not break layout |
| **P2** | States & feedback | loading, empty, offline, reconnect, success/error; Signal sent/received, Match, Mission, Cooldown visually coherent |
| **P3** | Motion + polish | short transitions; micro-interactions; normalized halos/pulses; no Christmas-tree effects; `prefers-reduced-motion` |
| **P4** | Accessibility + QA | contrast; focus; ≥44px touch; screen readers; orientation; refresh recovery; full-loop smoke |

## Color language (frozen for polish)

**Protocol / status semantics** (never reuse as decoration):

| Meaning | Color | CSS token |
|---------|-------|-----------|
| Available | green | `--proto-available` → feedback success |
| Busy | amber | `--proto-busy` → feedback warning |
| Unavailable | red | `--proto-unavailable` → feedback error |
| Signal | blue | `--proto-signal` → feedback info / `#7C9CFF` |
| Match | violet | `--proto-match` → `--wingman` |
| Mission | orange | `--proto-mission` → `#FF9F43` (mission-only) |
| Invisible / offline | gray | `--proto-offline` → `--t-muted` |

**Mood dots** (Radar intention — unchanged from design tokens; meaning never by hue alone):

| Mood | Color | Shape / motion |
|------|-------|----------------|
| Super ready | `#FF4D67` | second ring pulse |
| Open | `#FFC857` | solid glow |
| Exploring | `#F4F5F7` | quiet dot |

Rose (`--love`) remains reserved for Connection Confirmed. Do not recolor moods to “protocol green/amber/red”.

## Mobile gates (all P1–P4)

- No primary action that depends on **hover** only
- Important controls ≥ **44×44 px** touch target
- Bottom nav above iOS/Android **safe-area** insets
- Keyboard / `visualViewport` must not clip CTAs or chat input

## Radar polish focus

1. Marker readability (shape + color + glow)
2. Near vs far hierarchy **without** exact distance
3. Clear visual when a Signal leaves or arrives

## Mission polish focus

1. Active-mode feeling without overload
2. Readable timer + obvious primary CTA
3. Slow animation only on active mission state
4. Crystal-clear exit / cooldown

## P1 exit checklist

- [x] 360, 375, 390, 412 — dedicated bands, no horizontal overflow helpers
- [x] `100dvh` / `100svh` + `env(safe-area-inset-*)` on stage, nav, toast, chat
- [x] Keyboard: `visualViewport` → `--vv-offset` + `keyboard-open` (hides chrome, lifts chat)
- [x] Primary buttons / nav / chips ≥ 44px (`--touch-min`)
- [x] Hover enhancements only under `@media (hover:hover)` — tap remains primary

**P1 shipped in polish pass** — continue P2 (states & feedback).

## Run

```bash
AUTH_ALLOW_DEV=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
```
