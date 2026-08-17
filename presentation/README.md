# Wingman Presentation Suite

Investor-ready and user-ready PDF presentations for Wingman.

## Deliverables

| File | Description |
|------|-------------|
| `WINGMAN_MASTER_PRESENTATION.pdf` | Full story (~42 pages) |
| `WINGMAN_INVESTOR_DECK.pdf` | Pitch deck (~18 pages) |
| `WINGMAN_USER_OVERVIEW.pdf` | Simple user overview (~8 pages) |
| `WINGMAN_ONE_PAGER.pdf` | Single-page leave-behind |
| `WINGMAN_PRESENTATION_SOURCES.md` | Citations & repo sources |
| `WINGMAN_PRESENTATION_FACT_CHECK.md` | Conflicts & status honesty |

## Regenerate

```bash
npm install
npx playwright install chromium
npm run build
```

Sources live in `src/` (HTML + `shared.css`). Diagrams in `assets/diagrams/`. Screenshots in `assets/screenshots/`. QA page renders in `qa/`.

## 2026-08-17 V3.1 hierarchy update

The HTML sources and regenerated PDFs lock the approved hierarchy: **Social Interaction Facilitation Technology**
(category), **Make the first acquaintance easy.** (primary tagline), the supporting description covering nearby people
and repeated Destiny Connection crossings, and **Love is in the air.** (secondary emotional slogan). “Real-world
connection facilitator” is explanatory wording only; **One Connection at a Time.** remains an operating principle.

PDF + QA artifacts were regenerated with Playwright Chromium on 2026-08-17 after the binary was installed in this workspace.
