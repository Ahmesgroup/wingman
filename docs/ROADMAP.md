# Roadmap

**Status:** Decided (V4.1) · Executable status 2026-08-12 — see [`operations/PROJECT_STATE.md`](../operations/PROJECT_STATE.md).

**Sprint 0** — monorepo, CI, tooling, Prisma, PostgreSQL, Redis, auth foundation, design tokens, observability, ADRs.
**Sprint 1** — OTP, user, consent, profile, devices, Radar activation, presence, mood, core blocking.
**Sprint 2** — Signal + expirations, Connection, ActiveUserLock, selfie flow, temporary media, notifications, state machine.
**Sprint 3** — Mission Meet + anti-contact, Ticket, Mission Mode, outcome, cooldown, reports, moderation evidence.
**Sprint 4** — Wingman+, entitlements, payments, Pulse, admin, privacy requests, account deletion.
**Post-V1** — Destiny (after DPIA), multi-region, service extraction, specialized geo engine, optimizations.

## Executable progress (not a re-open of product sprints)

| Track | Status |
|-------|--------|
| Backend V1 (S0–S20) | **GO / frozen** |
| V1.1 engines S21–S26 | **Done** — engine sprints **stopped**; baseline collection |
| Client mobile-first + payment readiness | **Done** — payments **disabled** until credentials ([`CLIENT_MOBILE_PAYMENT_READINESS.md`](../operations/CLIENT_MOBILE_PAYMENT_READINESS.md)) |
| Next (engines) | Real baseline → **S26 Review** → A/B/C |
| Payments go-live | Sandbox cert → then `PAYMENTS_ENABLED=true` only |
