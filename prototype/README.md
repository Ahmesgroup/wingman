# Prototype

**Status:** Client mobile-first + payment readiness (payments disabled) + connection loop wired.

Open via a static server (`npx serve prototype -l 5173`) with the Nest API on `:3000` (`AUTH_ALLOW_DEV=true`).

Controls (top): EN/FR, Reduce motion, Offline. Loop: Radar → Signal → Selfie → Ticket → Mission → Outcome → Cooldown.

- `api.js` — Nest client (`x-user-id`); mock fallback if `/internal/live` is down; dual-user demo via `userId` override.
- `payments/` — dormant Stripe/Paddle; **DisabledPaymentProvider** default. No checkout CTAs.
- Entitlements FREE read-only (S19). Loading / offline / error banners on protocol actions.
- Smoke: `pnpm --filter @wingman/api exec vitest run src/client-loop.smoke.test.ts`

Files: `index.html`, `styles.css`, `app.js`, `api.js`, `payments/*`.
