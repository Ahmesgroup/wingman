# Realtime Architecture

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

WebSocket gateway (NestJS) pushes protocol events (`WEBSOCKET_EVENTS.md`). Presence heartbeats update Redis GEO +
heartbeat ZSET. Timed states carry absolute `expiresAt`; clients render `expiresAt − serverTime`. The server does not
need to emit an event at exactly 30s — the client derives warnings locally; the server only validates at each action
(D-015/D-026). Reconnection reconciles by reading connection `state` + `expiresAt`.
