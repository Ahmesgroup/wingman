# Wingman Presentation — Fact Check

**Date:** 2026-08-16  
**Purpose:** Record conflicts, defensibility choices, and honesty constraints used while authoring `presentation/`.

## Status taxonomy used

| Label | Meaning |
|-------|---------|
| **A** | Implemented and treated as product/backend capability today |
| **B** | Implemented but feature-flagged, payments-disabled, or internal |
| **C** | Field test / validation track — not fully proven with real multi-user production path |
| **D** | Planned / vision / hypothesis |

## Defensible factual baseline

| Claim in decks | Basis | Label |
|----------------|-------|-------|
| Mission: “Make the first acquaintance easy.” | README, PRD, PRODUCT_VISION | A (positioning) |
| Not a dating app / social network | README, COMPETITIVE_POSITIONING, PRD | A (positioning) |
| Protocol Radar→Signal→Selfie→Mutual→Mission→Cooldown | STATE_MACHINES, PRD, domain engine | A |
| Free 2 Signals/day; 1 active connection; Mission ~15 min | BUSINESS_MODEL, STATE_MACHINES, PROJECT_STATE | A (rules) |
| Silent expiry / no rejection notification | STATE_MACHINES, PRD | A |
| Backend V1 GO (S0–S20) | S20_PRODUCTION_CERTIFICATION, BACKEND_IMPLEMENTATION_STATUS | A |
| NestJS, Postgres, Redis, Prisma, WebSocket | BACKEND_IMPLEMENTATION_STATUS, ADRs | A |
| Twilio SMS + FCM/APNs provider ports | S18_PROVIDERS, BACKEND_IMPLEMENTATION_STATUS | A (ports exist; production SMS field proof open) |
| Stripe → Entitlements; payments disabled | S19, CLIENT_MOBILE_PAYMENT_READINESS, PROJECT_STATE | B |
| S21–S26 advanced engines implemented, learning OFF | S21–S26 docs, PROJECT_STATE | B |
| Destiny default off; not public field feature | README, S23, LIVE_FIELD_TEST, PROJECT_STATE | B / locked out of public field |
| Surface UI on Vercel | FIELD_TEST.md (`078d308`) | C (UI surface) |
| Live Field Test S27–S34; S27A OPEN; S27B deferred | LIVE_FIELD_TEST, S27_IDENTITY_OTP, PROJECT_STATE | C |
| Wingman+ €9.99 and Pass prices | BUSINESS_MODEL | Spec / not live revenue |
| Funding amount / valuation / live revenue | — | **Not claimed** (“TO BE DEFINED”) |

## Conflicts & resolutions

### 1) Destiny in Free tier vs public product reality
- **Docs:** `docs/BUSINESS_MODEL.md` and FR executive summary list Destiny on Free.
- **Ops reality:** Destiny default off; **OUT** of public field test until own gates (`PROJECT_STATE`, `LIVE_FIELD_TEST`).
- **Deck resolution:** Present Destiny as implemented/flagged capability, **not** a currently public core feature. Note Free-tier marketing inclusion as spec intent, not live public availability.

### 2) Wingman+ daily Signal count
- **BUSINESS_MODEL / PRD / MVP:** “20–25 / day” with open question to finalize.
- **Domain entitlements snippet in BACKEND_IMPLEMENTATION_STATUS §3.2:** “Plus 25”.
- **Deck resolution:** “20–25 (final number TBD)” per ASSUMPTIONS_AND_OPEN_QUESTIONS.

### 3) Early “No Stripe” wording vs S19
- **BACKEND_IMPLEMENTATION_STATUS §3.2** still says “No Stripe integration yet — Plus is a seed flag” in an early entitlements stub section.
- **Later sections / S19:** Stripe billing facts → EntitlementService exist; payments fail-closed.
- **Deck resolution:** Prefer S19 + payment readiness docs: entitlements architecture **A/B**, checkout **disabled**.

### 4) Client polish Active vs Stopped
- **docs/ROADMAP.md** (executable table): client polish P1–P4 “Active”.
- **operations/PROJECT_STATE.md** (2026-08-14): polish loop **STOPPED**.
- **Deck resolution:** Prefer PROJECT_STATE (newer lock): polish-by-habit stopped; Live Field Test is the active track.

### 5) MVP “In” includes Destiny / payments vs certification locks
- **MVP_SCOPE** lists Destiny deferred/post-V1 in one place and Free Destiny in business model; payments in Sprint 4 roadmap historically.
- **Deck resolution:** Use operational locks for “today”; use MVP/business docs for intended model.

### 6) Prototype screenshots
- Captured from `https://wingman-prototype.vercel.app/` splash + onboarding.
- Offline / sign-in banners may appear; decks label surface as demo-capable without claiming Live Field Test Ready.
- QA/debug interfaces (`?qa=1`) were **not** used as product screenshots.

### 7) Market statistics
- Pew usage/experience stats used with citation (US, not EU Wingman users).
- TAM/SAM figures presented as **directional ranges with diverging analyst definitions**, not Wingman revenue.
- SOM explicitly **HYPOTHESIS TO VALIDATE**.

### 8) Safety language
- Decks state Wingman does **not** guarantee physical-world safety.

### 9) Diagram SVG validity
- `vs-dating-apps.svg` initially failed to load in Chromium because of an unescaped `&` in XML text.
- Fixed to `&amp;` and PDFs regenerated.

## Items intentionally not exposed
Phone allow-lists, field-test OTP codes, API secrets, private env URLs beyond the public Vercel prototype URL already in ops docs, personal tester phone numbers.

## Remaining limitations
- Full Radar/Mission consumer screenshots under authenticated Nest-connected multi-user path were not captured in this pass (surface was offline/demo at capture time). Conceptual diagrams + splash/onboarding UI used instead, clearly labeled.
- Visual QA relies on rendered page screenshots in `presentation/qa/`; human review recommended before external send.
- Competitive landscape is philosophy-based; no claim of comprehensive live market audit of every proximity app.
