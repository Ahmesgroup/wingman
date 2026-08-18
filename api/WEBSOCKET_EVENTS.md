# WebSocket Events

**Status:** Decided (V4.1) · Transport for real-time protocol updates. No event reveals identity, photo, or precise
location.

| Event | Payload (minimal) | When |
|---|---|---|
| `radar.changed` | `{ zone, reason }` (`presence` / `leave` / `move` / `block`) | nearby set should refetch; **not** replayed |
| `radar.candidate.updated` | (sketch alias — transport uses `radar.changed`) | nearby set changes |
| `signal.received` | signalId, senderId, status | a Signal arrives |
| `signal.expired` | signalId | silent 10-min expiry (informational to receiver only)
| `selfie.received` | connectionId, expiresAt | peer selfie available |
| `selfie.window.expiring` | connectionId, expiresAt | client-derived warning; server does not need to fire at exactly 30s |
| `connection.confirmed` | connectionId | mutual validation |
| `ticket.activated` | connectionId, expiresAt | ticket created |
| `mission.opened` | missionId, expiresAt | Mission Meet opens |
| `mission.message` | missionId, msg (post-filter) | chat message |
| `mission.expired` | missionId | chat window elapsed |
| `cooldown.started` | expiresAt | after outcome |
| `cooldown.completed` | — | cooldown ends |
| `destiny.prompt` | promptId | repeated crossings (both consented) |
| `account.restricted` | restrictionId, until | moderation action |

Timers are conveyed as absolute `expiresAt`. The 30-second selfie/chat warning is derived on the client from
synchronized server time (D-015/D-026), so a delayed socket message never delays the warning; the server remains
authoritative on validity at each action.
