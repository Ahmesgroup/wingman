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

## 2026-08-17 positioning update

The HTML sources and regenerated PDFs lock the approved wording on Investor Deck cover and "What Wingman is" (slides 1-3),
Master Presentation opening (page 3), User Overview closing (page 8), and the One Pager: "Wingman is a real-world
connection facilitator. It helps two people who are already near each other safely discover mutual interest and say
hello in real life." / "From presence to hello."

PDF + QA artifacts were regenerated with Playwright Chromium on 2026-08-17 after the binary was installed in this workspace.
