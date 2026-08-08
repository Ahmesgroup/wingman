# Modular Monolith

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

NestJS modules: Auth, Profile, Radar, Signals, Connection, Missions, Safety, Billing, Privacy. Each module owns its
controllers, DTOs (Zod contracts), and services; all protocol mutation is delegated to `packages/domain`.

Dependency rule:
```
apps/api → packages/{domain,contracts,database,auth,privacy,media,notifications,billing,observability}
packages/domain → (no Prisma / NestJS / Redis / AWS)
```
Domain receives repository interfaces and a `Clock`, so the entire protocol is unit-testable without infrastructure.
Cross-module workflows are coordinated by the Connection module, which is the root of the protocol.
