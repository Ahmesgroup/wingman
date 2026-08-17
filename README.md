# Wingman — Product & Engineering Specification

> **From presence to hello.**
> Wingman is a real-world connection facilitator. It helps two people who are already near each other safely discover mutual interest and say hello in real life.

**Status:** Foundation spec **plus executable backend (S0–S20)** — **Backend V1 certified GO** · **V1.1** starts at S21 (Radar Intelligence, feature-flagged).
**Version:** 4.1 · **Region:** Single EU · **Owner:** Igor Chernikov · **Prepared by:** AHMES GROUP

This repository is the complete design-and-engineering dossier for Wingman **and** the working
backend engine + NestJS production envelope. Product specs remain under `docs/`, `architecture/`,
`api/`, etc. Application code lives under `apps/` and `packages/`.

**Backend implementation (English):** [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](implementation/BACKEND_IMPLEMENTATION_STATUS.md) · quick start [`apps/BACKEND_README.md`](apps/BACKEND_README.md).

## What Wingman is

A real-world connection facilitator that lowers the emotional cost of the first approach between two
people who are already physically near each other. It deliberately refuses swipe feeds, public profile browsing,
endless chat, and any mechanic whose only effect is to increase time-in-app.

Wingman does not help you collect matches. Wingman helps you make the first acquaintance.

The core product rule: *a feature that increases time spent in the app without increasing the chance
of a real interaction must be rejected.*

## How to navigate this repo

Start here, then follow the links:

1. `DOCUMENTATION_INDEX.md` — the full map of every document.
2. `implementation/BACKEND_IMPLEMENTATION_STATUS.md` — what was built for the backend (S0–S20).
3. `operations/S20_PRODUCTION_CERTIFICATION.md` — Backend V1 go/no-go certificate.
4. `apps/BACKEND_README.md` — run/test the NestJS API.
5. `docs/PRD.md` — the product requirements.
6. `docs/FR_EXECUTIVE_SUMMARY.md` — résumé exécutif en français.
7. `architecture/SYSTEM_ARCHITECTURE.md` — how the system is built and why.
8. `architecture/STATE_MACHINES.md` — the heart of the product: the connection protocol.
9. `database/schema.prisma` + `database/DATABASE_INVARIANTS.md` — the data model and its guarantees.
10. `design/DESIGN_SYSTEM.md` + `design/design-tokens.json` — the visual language.
11. `prototype/index.html` — mobile-first web client (wired to Nest; payments disabled) — [`operations/CLIENT_MOBILE_PAYMENT_READINESS.md`](operations/CLIENT_MOBILE_PAYMENT_READINESS.md).
12. `implementation/REPOSITORY_BOOTSTRAP_PROMPT.md` — original bootstrap prompt for greenfield coding agents.
13. `operations/PROJECT_STATE.md` — locked board (engines frozen during baseline; client track status).

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

## Opening the mobile-first client

Serve the prototype against the Nest API (dev auth):

```bash
AUTH_ALLOW_DEV=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
# → http://localhost:5173/
```

Then: switch EN/FR, toggle **Reduce motion** / **Offline**, activate the Radar, send a Signal,
run selfie → ticket → Mission Meet (try a phone number / `@handle` for anti-contact), outcome,
Cooldown. Entitlements FREE are read-only; **payments are disabled** (no checkout CTAs).
Details: [`operations/CLIENT_MOBILE_PAYMENT_READINESS.md`](operations/CLIENT_MOBILE_PAYMENT_READINESS.md).

A hidden **Admin moderation preview** link lives at the bottom of Settings.

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
