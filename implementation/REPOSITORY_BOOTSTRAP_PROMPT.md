# Repository Bootstrap Prompt

Give this to Claude Code / Codex to turn this spec into a real monorepo. Do not paste application code yet — scaffold
first, then implement sprint by sprint following `implementation/`.

---

You are bootstrapping the Wingman application monorepo from the specification in
`wingman-product-and-engineering-spec/`. Read `README.md`, `DECISION_LOG.md`, `docs/PRD.md`,
`architecture/STATE_MACHINES.md`, `database/schema.prisma`, `database/DATABASE_INVARIANTS.md`, and
`implementation/AI_CODING_RULES.md` first.

Create this monorepo (pnpm + Turborepo):

```
wingman/
├── apps/       mobile (Expo RN TS) · web (Next.js) · admin (Next.js) · api (NestJS) · workers (NestJS standalone)
├── packages/   database (Prisma) · domain (pure) · contracts (Zod) · auth · privacy · media · notifications · billing · observability · ui
├── infrastructure/  docker · terraform (eu-west) · monitoring
├── turbo.json · pnpm-workspace.yaml · package.json
```

Constraints (from DECISION_LOG): NestJS modular monolith, single EU region, PostgreSQL + Redis + private encrypted
object storage + workers, Zod contracts, REST for business ops, WebSocket for real-time, no Rust/microservices/
multi-region in V1. `packages/domain` imports no Prisma/NestJS/Redis/AWS.

Steps:
1. Scaffold the workspace, tooling (TS strict, ESLint, Prettier), and CI skeleton.
2. Copy `database/schema.prisma`; add the hand-written migration for partial unique indexes and CHECK constraints
   (see `database/MIGRATION_STRATEGY.md` and `DATABASE_INVARIANTS.md`).
3. Implement `packages/domain` state machines with pure unit tests (no DB) before wiring infrastructure.
4. Follow `implementation/SPRINT_0.md` … `SPRINT_3.md`.
5. Enforce `implementation/AI_CODING_RULES.md`.

Finish each task with typecheck + lint + tests + build and a summary of changed files.
