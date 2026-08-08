# Design System

**Status:** Frozen (Design Engineering Spec V4.0) · Tokens: `design-tokens.json` · Related: `COLOR_SYSTEM.md`,
`TYPOGRAPHY.md`, `MOTION_AND_HAPTICS.md`, `ACCESSIBILITY.md`, `SCREEN_SPECIFICATIONS.md`

## Voice

> Wingman remains visually quiet until mutual interest is established. Emotion is introduced progressively and
> reaches its highest intensity only when a connection is confirmed.

Night, premium, calm, discreet, secure, magnetic. It must not resemble Tinder/Bumble warm gradients. The
emotional arc is **night → violet → lavender → rose**, mapping to *calm → interest → connection → emotion*.

## Palette (authoritative values in `design-tokens.json`)

Backgrounds `#0B1020` / `#12182B` / radar `#080D1A`. Surfaces card `#171F35`, elevated `#1D2740`, map element
`#161E31`, borders `#27304A`. Brand: wingman `#7C5CFC`, air `#B9A7FF`, love `#FF7DAE`. Text `#F7F8FC` / `#AAB2C8`
/ `#7D879F` / `#596176`. Feedback success `#40D39C`, warning `#FFBF69`, error `#FF5C72`, info `#7C9CFF`.
Moods: super ready `#FF4D67`, open `#FFC857`, exploring `#F4F5F7`.

**Rose is reserved** for Connection Confirmed and rare marketing moments. Violet is the color of initiative
(the Signal), never urgency or sexualization.

## Mood dots — never color alone

| Mood | Color | Shape / motion |
|---|---|---|
| Super ready | `#FF4D67` | central dot + double concentric halo, slow pulse on `radarPulse` |
| Open | `#FFC857` | central dot + single stable halo, no motion |
| Exploring | `#F4F5F7` | bare dot, soft translucent border, no halo |

Status colors (timer/feedback) are kept distinct from mood colors by shape and animation so a red mood dot never
reads as danger or error.

## Radar

Abstract but legible: simplified urban masses (`#161E31`), no street names, no addresses, no businesses, no exact
positions. Your position is a violet dot (`#9B87FF`) with a slow 3s pulse. Others appear only as mood dots with a
soft glow. Relative distance is shown qualitatively ("Very close", "Nearby", "Around you") in the label style,
never an exact distance. **Signal animation is a diffuse omnidirectional wave** from the button; the targeted dot
*resonates* (its glow widens and pulses twice) — there is no straight trajectory that would imply exact targeting.

## Typography

Display **Sora** (used sparingly: big titles, "Connection confirmed", emotional screens). Interface **Manrope**
(headings, body, labels). Mono **JetBrains Mono** (admin identifiers, logs, timestamps). Scale: displayLarge 36/700,
heading 24/700, body 16/400, label 14/600.

## Motion & haptics

Durations 120/180/280/500/900 ms; radar pulse 3000 ms; easings standard/enter/exit per tokens. Respect
`prefers-reduced-motion`: pulses become a fixed muted halo, transitions collapse to instant.

Haptics: selection `light`, signalSent `soft`, connectionConfirmed `doubleSoft`, timeWarning `warningShort`, error
`rigid`, enabled by default. Rules: respect system + Wingman preferences; **never** vibrate repeatedly during a
countdown; `doubleSoft` is the exclusive sensory signature of Connection Confirmed.

## Four locked refinements (V4.0)

1. **No aggressive exit in the selfie exchange.** The secondary action is a quiet "Let it expire" — no red, no X,
   no confirmation sent to the other person.
2. **Calm timer by default.** Text `MM:SS` + one thin linear progress bar. The ring is reserved for the primary
   button or omitted; three simultaneous time indicators are avoided outside enhanced-accessibility mode.
3. **Warning derived locally.** The 30-second visual/haptic change is computed from synchronized server time
   (`expiresAt − serverTime`); no exact server event at 00:30 is needed, so WebSocket latency can't delay it. The
   server remains authoritative on validity at each action.
4. **Complete haptics policy** (above).

## Key screen expressions

| Moment | Expression |
|---|---|
| Radar | silent, spatial, contemplative |
| Signal | magnetic, diffuse, no precise targeting |
| Waiting | neutral, no sense of rejection |
| Selfie | intimate, focused, temporal; calm timer |
| Connection | warm and exceptional (violet halos fuse → rose, "Connection confirmed", `doubleSoft`) |
| Mission | functional, human, distraction-free |
| Cooldown | calm, non-punitive |

## Accessibility floor

Keyboard navigation, visible focus, sufficient contrast, ARIA roles/labels, alt text, reduce-motion, no
state-by-color-only, explicit button labels, always-readable timers (text + bar + optional haptic).
