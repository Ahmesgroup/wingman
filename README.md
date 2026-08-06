# Wingman

Interactive prototype for **Wingman** — a quiet, privacy-first protocol that turns a nearby encounter into a real meetup.

Open [`index.html`](index.html) in a browser (no build step).

## Semantic Color Contract

> **A color never represents an action; it always represents a state. An action is carried by shape, hierarchy, or animation.**

| Color | Hex | Meaning only | Never |
| --- | --- | --- | --- |
| Emerald | `#10B981` | Available | Validate / success CTA |
| Amber | `#F59E0B` | Busy soon | Generic warning chrome |
| Red | `#EF4444` | Unavailable / danger / critical error | Notifications, badges, CTAs |
| Blue | `#3B82F6` | Interaction (signal) | Primary button |
| Violet | `#8B5CF6` | Mutual match | Decoration, brand chrome |
| Orange | `#FB923C` | Mission active | Graphic accent |
| Turquoise | `#22D3EE` | Wingman system (radar, GPS, scan, AI) | User presence |
| Gray | `#6B7280` / `#374151` | Invisible / offline | — |

### Signal direction (same blue, different fill)

| State | Glyph | Treatment |
| --- | --- | --- |
| Signal sent | ◉ | Blue **filled** |
| Signal received | ◎ | Blue **outline** |

### Radar shapes

| State | Shape | Color |
| --- | --- | --- |
| Available | ● | Emerald |
| Busy | ▲ | Amber |
| Unavailable | ■ | Red |
| Signal sent | ◉ | Blue filled |
| Signal received | ◎ | Blue outline |
| Match | ◆ | Violet |
| Mission | ⬢ | Orange (slow breath 100%↔96% / 3s) |
| Invisible | ○ | Gray |
| Offline | ✕ | Dark gray |

### Notifications

Blue = signals · Violet = match · Orange = mission. **Never red.**

### Surfaces

Background `#0B1020` · Cards `#171F35` · Borders `rgba(255,255,255,.05)` · Text `#FFFFFF` / `#AAB2C8` / `#6B7280` · CTAs use hierarchy (`#F7F8FC`), not state colors.

Canonical tokens: [`design/design-tokens.json`](design/design-tokens.json).

## Repo

```bash
git clone https://github.com/Ahmesgroup/wingman.git
cd wingman
# open index.html
```
