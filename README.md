# Wingman

Interactive prototype for **Wingman** — a quiet, privacy-first protocol that turns a nearby encounter into a real meetup.

Open [`index.html`](index.html) in a browser (no build step).

## Design principle

Colors encode **state**, not decoration. The brain should read the screen in under a second.

| State | Color | Hex | Shape |
| --- | --- | --- | --- |
| Available | Emerald | `#10B981` | ● Circle |
| Busy soon | Amber | `#F59E0B` | ▲ Triangle |
| Unavailable | Red | `#EF4444` | ● Circle |
| Signal sent | Blue | `#3B82F6` | ◉ Circle + ring |
| Mutual match | Violet | `#8B5CF6` | ◆ Diamond |
| Mission active | Orange | `#FB923C` | ⬢ Hexagon |
| Invisible | Gray | `#6B7280` | — |
| Offline | Dark gray | `#374151` | ○ Empty circle |

**Available** intensity uses one green with opacity (`100%` / `80%` / `60%`) — never multiple greens.

Surfaces: background `#0B1020`, cards `#171F35`, borders `rgba(255,255,255,.05)`, text `#FFFFFF` / `#AAB2C8` / `#6B7280`.

Canonical tokens: [`design/design-tokens.json`](design/design-tokens.json).

## Repo

```bash
git clone https://github.com/Ahmesgroup/wingman.git
cd wingman
# open index.html
```
