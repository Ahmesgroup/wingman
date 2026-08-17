# Wingman Presentation — Sources

**Generated:** 2026-08-16  
**Workspace:** `C:\Users\papan\Downloads\wingman`

## Primary repository sources (product & status)

| Source | Used for |
|--------|----------|
| `README.md` | Category, mission, stack decisions, Destiny default off |
| `docs/PRODUCT_VISION.md` | Vision / success definition |
| `docs/PRD.md` | Problem, protocol, constraints, safety posture |
| `docs/BUSINESS_MODEL.md` | Free / Plus / one-time SKUs |
| `docs/COMPETITIVE_POSITIONING.md` | Positioning vs dating apps |
| `docs/GO_TO_MARKET.md` | Density-first GTM |
| `docs/SUCCESS_METRICS.md` | North star & funnel targets |
| `docs/ROADMAP.md` | Historical + executable track table |
| `docs/MVP_SCOPE.md` | In/out scope |
| `docs/FR_EXECUTIVE_SUMMARY.md` | Cross-check (FR); decks are English |
| `architecture/STATE_MACHINES.md` | Protocol states & windows |
| `implementation/BACKEND_IMPLEMENTATION_STATUS.md` | What backend code exists (S0–S26) |
| `apps/BACKEND_README.md` | Operator entry |
| `operations/S20_PRODUCTION_CERTIFICATION.md` | Backend V1 GO |
| `operations/S21_RADAR_INTELLIGENCE.md` | Radar Intelligence |
| `operations/S22_CONTEXT_ENGINE.md` | Context Engine |
| `operations/S23_DESTINY_V2.md` | Destiny V2 flags & rules |
| `operations/S24_ANTI_ABUSE.md` | Anti-abuse |
| `operations/S25_GEO_INTELLIGENCE.md` | Geo intelligence |
| `operations/S26_MEASUREMENT.md` | Measurement baselines; learning lock |
| `operations/FIELD_TEST.md` | Surface UI field test |
| `operations/LIVE_FIELD_TEST.md` | S27–S34 live track & DoD |
| `operations/S27_IDENTITY_OTP.md` | S27A/S27B identity gates |
| `operations/PROJECT_STATE.md` | Locked board (authoritative “today”) |
| `operations/CLIENT_MOBILE_PAYMENT_READINESS.md` | Payments disabled |
| `privacy/CONSENT_MODEL.md` | Per-purpose consent |
| `ASSUMPTIONS_AND_OPEN_QUESTIONS.md` | Open Plus Signal count, Destiny DPIA, etc. |
| `design/COLOR_SYSTEM.md` | Night `#0B1020`, violet accents |
| `prototype/index.html` / Vercel surface | UI screenshots |

## External citations (statistics only)

| Citation | Claim used | URL |
|----------|------------|-----|
| Pew Research Center, “Key findings about online dating in the U.S.” (Feb 2, 2023; survey July 5–17, 2022) | 53% of US adults under 30 have ever used a dating site/app; mixed experiences / insecurity & overwhelm themes | https://www.pewresearch.org/short-reads/2023/02/02/key-findings-about-online-dating-in-the-u-s/ |
| Pew Research Center online dating report hub (2023) | Broader context for online dating prevalence & harassment experiences | https://www.pewresearch.org/internet/2023/02/02/from-looking-for-love-to-swiping-the-field-online-dating-in-the-u-s |
| Business of Apps (via secondary summaries, 2024–2026 roundups) | Directional global dating-app revenue ~$6B+ (2024) — **definition-dependent** | https://www.businessofapps.com/ (see dating app reports) |
| Market Data Forecast — Europe Online Dating | Example EU market sizing (~USD 1.17B in 2025 per that firm) — **one analyst view** | https://www.marketdataforecast.com/market-reports/europe-online-dating-market |
| Statista Digital Market Outlook (paywalled series) | Alternate EU/online dating revenue series — cited only as “definitions diverge” | https://www.statista.com/statistics/1358050/online-dating-revenue-europe/ |

**Note:** Market sizing sources disagree. Decks present ranges and label SOM as hypothesis. No Wingman revenue invented.

## Assets

| Asset | Origin | License / note |
|-------|--------|----------------|
| `assets/screenshots/01-splash.png` | Captured from public Wingman prototype UI | Product screenshot · Wingman |
| `assets/screenshots/02-onboarding-problem.png` | Same | Product screenshot · Wingman |
| `assets/diagrams/*.svg` | Generated for this suite | Original · Wingman presentation |
| `src/shared.css` + HTML sources | Generated for this suite | Regenerable via `scripts/build.mjs` |

## Regeneration

```bash
cd presentation
npm install
npm run build
```

Requires Node.js. First run downloads Chromium for Playwright.
