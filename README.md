# Wingman — Product & Engineering Specification

> **Make the first acquaintance easy.** · *Love is in the air.*
> Category: **social interaction facilitation technology** — not a traditional dating app.

**Status:** Foundation spec, ready to start V1 implementation.
**Version:** 4.1 · **Region:** Single EU · **Owner:** Igor Chernikov · **Prepared by:** AHMES GROUP

This repository is the complete design-and-engineering dossier for Wingman. It is written so that a
small team — or several AI coding agents — can begin implementation without re-interpreting the
product. It is documentation and a working prototype, **not** the application code yet.

## What Wingman is

A real-time protocol that lowers the emotional cost of the first approach between two people who are
already physically near each other. It deliberately refuses swipe feeds, public profile browsing,
endless chat, and any mechanic whose only effect is to increase time-in-app.

The core product rule: *a feature that increases time spent in the app without increasing the chance
of a real interaction must be rejected.*

## How to navigate this repo

Start here, then follow the links:

1. `DOCUMENTATION_INDEX.md` — the full map of every document.
2. `docs/PRD.md` — the product requirements.
3. `docs/FR_EXECUTIVE_SUMMARY.md` — résumé exécutif en français.
4. `architecture/SYSTEM_ARCHITECTURE.md` — how the system is built and why.
5. `architecture/STATE_MACHINES.md` — the heart of the product: the connection protocol.
6. `database/schema.prisma` + `database/DATABASE_INVARIANTS.md` — the data model and its guarantees.
7. `design/DESIGN_SYSTEM.md` + `design/design-tokens.json` — the visual language.
8. `prototype/index.html` — the interactive prototype (see below).
9. `implementation/REPOSITORY_BOOTSTRAP_PROMPT.md` — the prompt that turns this into real code.

## Reading order by role

| Role | Read |
|---|---|
| Product | `docs/PRD.md`, `docs/PRODUCT_PRINCIPLES.md`, `docs/SUCCESS_METRICS.md`, `docs/BUSINESS_MODEL.md` |
| Architect | `architecture/*`, `database/*`, `api/API_OVERVIEW.md` |
| Backend | `architecture/STATE_MACHINES.md`, `database/*`, `api/*`, `security/*` |
| Mobile | `mobile/*`, `design/*`, `api/WEBSOCKET_EVENTS.md` |
| Design | `design/*` |
| Security / Privacy | `security/*`, `privacy/*` |
| QA | `testing/*` |
| DevOps | `operations/*` |

## Opening the prototype

No build step, no backend. Open the file directly:

```
prototype/index.html
```

Then: switch EN/FR (top right), toggle **Reduce motion** and **Offline**, activate the Radar, tap a
mood dot, send a Signal, run the selfie exchange, reach *Connection confirmed*, open Mission Meet
(try typing a phone number or `@handle` to see the anti-contact filter), confirm the outcome, and land
in Cooldown. A hidden **Admin moderation preview** link lives at the bottom of Settings.

## Key decisions at a glance

- **NestJS modular monolith**, single EU region. No Rust, no distributed DB, no microservices in V1.
- **PostgreSQL** for durable data, **Redis** for ephemeral state (presence, sessions, chat), **private
  encrypted object storage** for selfies.
- **Server-authoritative timers.** Going offline never pauses a countdown.
- **One active connection per user**, enforced by a database-level lock.
- **Silent expiration only** — the product never sends a rejection.
- **Consent is per-purpose, append-only, versioned.**
- **Destiny Connection** is off by default and treated as sensitive / likely post-V1.

See `DECISION_LOG.md` for the full record and `architecture/ADR/` for the formal decisions.
