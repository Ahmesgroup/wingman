# Prototype

**Status:** Client mobile-first + payment readiness (payments disabled).

Open via a static server (`npx serve prototype -l 5173`) with the Nest API on `:3000` (`AUTH_ALLOW_DEV=true`).

Controls (top): EN/FR, Reduce motion, Offline. Loop: Radar → Signal → Selfie → Ticket → Mission → Outcome → Cooldown.

- `api.js` — Nest client (`x-user-id`); mock fallback if `/internal/live` is down.
- `payments/` — dormant Stripe/Paddle adapters; **DisabledPaymentProvider** is the default. No checkout CTAs. No card fields.
- Entitlements shown read-only (FREE · signals · ticket). S19 remains source of truth.

Files: `index.html`, `styles.css`, `app.js`, `api.js`, `payments/*`.
