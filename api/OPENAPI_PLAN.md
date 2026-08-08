# OpenAPI Plan

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Contracts are defined with Zod in `packages/contracts` and exported to OpenAPI for docs and client generation.
WebSocket events are documented in `WEBSOCKET_EVENTS.md` (AsyncAPI optional later). Generated types are shared by
mobile, web, and admin to keep request/response shapes consistent.
