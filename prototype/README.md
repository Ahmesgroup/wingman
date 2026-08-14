# Prototype

**Status:** Client mobile-first + payment readiness (payments disabled) + connection loop wired.  
**Doc:** [`operations/CLIENT_MOBILE_PAYMENT_READINESS.md`](../operations/CLIENT_MOBILE_PAYMENT_READINESS.md)

## Run

```bash
AUTH_ALLOW_DEV=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
# → http://localhost:5173/
```

## Deploy (Vercel — client UI)

```bash
npx vercel --cwd prototype --prod --yes
```

On Vercel the Nest API is not co-hosted; the client falls back to **mock/demo** unless `?api=https://your-api` (HTTPS) is set. Field UI review works in mock; live Nest loop still needs a reachable API.

Controls (top): EN/FR, Reduce motion, Offline. Loop: Radar → Signal → Selfie → Ticket → Mission → Outcome → Cooldown.

- `api.js` — Nest client (`x-user-id`); mock fallback if `/internal/live` is down; dual-user demo via `userId` override.
- `payments/` — dormant Stripe/Paddle adapters; **DisabledPaymentProvider** default. No checkout CTAs. No card fields.
- Entitlements FREE read-only (S19). Loading / offline / error banners on protocol actions.
- Smoke: `pnpm --filter @wingman/api exec vitest run src/client-loop.smoke.test.ts`

Files: `index.html`, `styles.css`, `app.js`, `api.js`, `payments/*`.
