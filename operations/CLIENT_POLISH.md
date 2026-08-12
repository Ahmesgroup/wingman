# Client Polish Only — P1–P4

**Status:** P1–P4 implementation DONE · Next = real-phone [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md)  
**Forbidden:** new engines (S27+), payment enablement, domain S0–S26 changes, **P5 by default**  
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

**P1 shipped** — responsive / safe-area / keyboard.

## P2 exit checklist

- [x] Loading with hard timeout (12s) — no infinite spinner
- [x] Empty: Radar inactive hint + Signal list empty state
- [x] Offline / reconnecting banners + Reconnect CTA + `online`/`offline` events
- [x] Toast kinds mapped to `--proto-*` (success / error / signal / match / mission / busy / offline)
- [x] Phase strip for Signal / validation / match / mission / cooldown
- [x] Feedback after Signal, Match, Mission, Cooldown actions
- [x] Session restore after refresh (`localStorage` wingman_proto_session_v1)

**P2 shipped** — next: **P3 motion + micro-interactions** only.

## P3 exit checklist

- [x] View enter: short opacity only (`--motion-enter` 220ms) — no layout shift
- [x] CTA tap feedback immediate (`:active` + `is-tapped`); never blocks actions
- [x] Protocol motion: Radar go-active burst, Signal blue wave, Match fuse (one-shot), Mission breathe (only infinite), Cooldown calm fade
- [x] No infinite canvas pulses; SUPER_READY = static second ring
- [x] Signal / Match / Mission visually distinct (blue / violet / orange)
- [x] `prefers-reduced-motion` + Reduce motion toggle: no breathe, no enter anim, instant navigation delays
- [x] Timings short (`--motion-tap` / `--motion-proto`); Match→ticket ≤900ms (200ms reduced)

**P3 shipped** — next: **P4 accessibility + QA** only.

## P4 exit checklist

- [x] Contrast: raised `--t-muted` / `--t-secondary`; nav & secondary actions readable
- [x] Focus: `:focus-visible` on controls; skip link; focus moves into active view
- [x] Labels / ARIA: form `for`/`id`, switch `aria-labelledby`, sheet `role=dialog`, view `aria-hidden`/`inert`, live announce
- [x] Touch ≥44px: pills, Open Signal (`btn-compact`), chips/nav already gated
- [x] Mood not by color alone: legend shape hints (ring / solid / quiet) + SR nearby list
- [x] Radar keyboard: canvas Enter/Space opens nearest; Escape closes sheet
- [x] Orientation / keyboard / refresh session / offline-reconnect retained
- [x] Smoke: `Smoke P4` chip + `?smoke=1` walks Splash→…→Cooldown→Radar

**P4 shipped** — polish *implementation* closed.

## After P4 (no auto P5)

```text
Client Polish Review (real phone) → FREEZE V1  |  P5 only if reproducible defects
```

See [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md). Smoke is not a substitute for on-device fluidity / state clarity / touch / readability in motion.

## Run

```bash
AUTH_ALLOW_DEV=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
```
