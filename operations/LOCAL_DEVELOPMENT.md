# Local Development

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`pnpm install`; docker-compose brings up PostgreSQL + Redis + a local object store; `prisma migrate dev`; seed with
fictional data (`../database/SEED_DATA.md`); run api + workers + mobile via Turborepo. The prototype needs nothing —
open `prototype/index.html`.
