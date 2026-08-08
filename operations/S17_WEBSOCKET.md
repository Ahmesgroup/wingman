# S17 — WebSocket realtime transport

**Status:** Implemented · Domain rules unchanged (S0–S16 frozen)

## Principle

HTTP controllers and the WS gateway both call **application services**; only those services touch `WingmanEngine`. The gateway never imports `@wingman/domain`.

```text
HTTP controller ─┐
                 ├─> Application Service ─> Domain ─> Persistence
WS gateway ──────┘
                           │
                           └─> RealtimeAppService ─> RealtimeHub ─> sockets / Redis bus
```

## Rooms (server-assigned)

| Room | Purpose |
|------|---------|
| `user:{id}` | Private events for that user |
| `radar:{zone}` | Anonymized radar/presence zone updates |
| `connection:{id}` | Validation / match lifecycle |
| `mission:{id}` | Mission Meet/Mode (same id as connection in V1) |

Clients request `subscribe { connectionId, missionId }`; the server authorizes from identity + connection membership + blocks.

## Envelope

```json
{
  "eventId": "1710000000000-000001",
  "type": "signal.received",
  "occurredAt": "2026-08-09T04:00:00.000Z",
  "aggregateId": "sig_…",
  "version": 1,
  "payload": {},
  "rooms": ["user:b"]
}
```

Types: `presence.changed`, `radar.changed`, `signal.received`, `signal.updated`, `validation.updated`, `match.created`, `mission.updated`, `mission.expired`, `connection.closed`.

## Replay

- Short in-memory `ReplayBuffer` per room
- Client `resume { lastEventId }` → missing durable events only
- `presence.changed` / `radar.changed` are **not** replayed; client gets a `snapshot` instead

## Multi-instance

`RealtimeHub` publishes on ephemeral channel `wingman.realtime` (Redis when `REDIS_URL` is set). Delivery is deduped by `eventId`.

## Connect (dev)

```bash
# auth.userId with AUTH_ALLOW_DEV (default in Nest register)
socket.io client path: /ws
auth: { userId: "a" }
# or Bearer token + deviceId for session auth
```

## Tests

```bash
pnpm --filter @wingman/realtime test
pnpm --filter @wingman/api test   # includes ws.e2e + architecture gateway gate
```
