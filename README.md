# Wingman — Product & Engineering Specification

> **Make the first acquaintance easy.** · *Love is in the air.*
> Category: **social interaction facilitation technology** — not a traditional dating app.

**Status:** Foundation spec **plus executable backend (S0–S17)** in this monorepo.
**Version:** 4.1 · **Region:** Single EU · **Owner:** Igor Chernikov · **Prepared by:** AHMES GROUP

This repository is the complete design-and-engineering dossier for Wingman **and** the working
backend engine + NestJS production envelope. Product specs remain under `docs/`, `architecture/`,
`api/`, etc. Application code lives under `apps/` and `packages/`.

**Backend implementation (English):** [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](implementation/BACKEND_IMPLEMENTATION_STATUS.md) · quick start [`apps/BACKEND_README.md`](apps/BACKEND_README.md).

## What Wingman is

A real-time protocol that lowers the emotional cost of the first approach between two people who are
already physically near each other. It deliberately refuses swipe feeds, public profile browsing,
endless chat, and any mechanic whose only effect is to increase time-in-app.

The core product rule: *a feature that increases time spent in the app without increasing the chance
of a real interaction must be rejected.*

## How to navigate this repo

Start here, then follow the links:

1. `DOCUMENTATION_INDEX.md` — the full map of every document.
2. `implementation/BACKEND_IMPLEMENTATION_STATUS.md` — what was built for the backend (S0–S17).
3. `apps/BACKEND_README.md` — run/test the NestJS API.
4. `docs/PRD.md` — the product requirements.
5. `docs/FR_EXECUTIVE_SUMMARY.md` — résumé exécutif en français.
6. `architecture/SYSTEM_ARCHITECTURE.md` — how the system is built and why.
7. `architecture/STATE_MACHINES.md` — the heart of the product: the connection protocol.
8. `database/schema.prisma` + `database/DATABASE_INVARIANTS.md` — the data model and its guarantees.
9. `design/DESIGN_SYSTEM.md` + `design/design-tokens.json` — the visual language.
10. `prototype/index.html` — the interactive prototype (see below).
11. `implementation/REPOSITORY_BOOTSTRAP_PROMPT.md` — original bootstrap prompt for greenfield coding agents.

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
