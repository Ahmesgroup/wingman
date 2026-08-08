# State Management

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Lightweight store (e.g., Zustand) for session, presence, and current connection state; server remains source of
truth. Real-time events patch local state; on reconnect the app refetches the active connection and re-derives
timers. No sensitive data persisted on device beyond the session token (secure storage).
