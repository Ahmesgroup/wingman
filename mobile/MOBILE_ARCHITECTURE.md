# Mobile Architecture

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Expo + React Native + TypeScript. Layers: UI (`packages/ui`), navigation, a real-time client (WebSocket) that
reconciles from `state`+`expiresAt`, a REST client with idempotency keys, and secure token storage. The app is never
authoritative over timers; it renders `expiresAt − serverTime`. Reduce-motion and haptics preferences are honored
app-wide.
