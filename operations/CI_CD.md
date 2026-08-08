# CI/CD

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Pipeline: install → typecheck (strict) → lint → unit → integration (ephemeral PG+Redis) → prisma validate + migration
test → secret scan → dependency audit → SAST → build → prototype smoke → Markdown link check. Deploys require green
gates and reviewed migrations.
