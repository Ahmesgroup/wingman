# Offline Behavior

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Radar: active status held ~2 min then invisible. Selfie/Mission/Ticket/Cooldown timers keep running server-side; on
reconnect the app reconciles and, if `now > expiresAt`, shows the expired state immediately. A short (30–60s) network
tolerance applies to action acceptance only. An offline banner indicates the state; nothing sensitive is cached.
