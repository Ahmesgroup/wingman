# CI/CD

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Pipeline: install → typecheck (strict) → lint → unit → integration (ephemeral PG+Redis) → prisma validate + migration
test → secret scan → dependency audit → SAST → build → prototype smoke → Markdown link check. Deploys require green
gates and reviewed migrations.

E2E / Playwright: if the job times out on **Install Playwright Chromium**, rerun the `e2e` job only. That is CI/infrastructure, not product-failure evidence. Do not reopen a product ticket by default. If a real Playwright spec starts and fails, resume with exact spec name, exact error, and trace/artifact. No preventive product code until a reproducible regression is shown.
