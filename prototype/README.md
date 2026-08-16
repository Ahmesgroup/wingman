# Prototype

**Status:** Client mobile-first + payment readiness (payments disabled) + connection loop wired.  
**Doc:** [`operations/CLIENT_MOBILE_PAYMENT_READINESS.md`](../operations/CLIENT_MOBILE_PAYMENT_READINESS.md)  
**Product URL:** https://wingman-prototype.vercel.app/ (testers open this only — no `?api=`)

## Run

```bash
AUTH_ALLOW_DEV=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
# → http://localhost:5173/
```

## Deploy (Vercel — client UI)

Set Production (and Preview if needed) env on project **wingman-prototype**:

```bash
WINGMAN_API_URL=https://wingman-api-three.vercel.app
```

Build runs `node scripts/write-config.mjs` and bakes the URL into `config.js`.

```bash
npx vercel --cwd prototype --prod --yes
```

Public testers must **not** need `?api=…`. That override (and `localStorage.wingman_api_base`) is **localhost / `?qa=1` only**. Without a reachable API on the product host, the UI shows unreachable — it does **not** silently demo-auth as the product path.

Controls (top, `?qa=1` only on hosted): EN/FR, Reduce motion, Offline. Loop: Radar → Signal → Selfie → Ticket → Mission → Outcome → Cooldown.

- `config.js` — baked `WINGMAN_API_URL` (`window.__WINGMAN_CONFIG__.apiUrl`)
- `api.js` — Nest client (Bearer session / local `x-user-id` only); mock only for local/lab
- `payments/` — dormant Stripe/Paddle adapters; **DisabledPaymentProvider** default. No checkout CTAs. No card fields.
- Entitlements FREE read-only (S19). Loading / offline / error banners on protocol actions.
- Smoke: `pnpm --filter @wingman/api exec vitest run src/client-loop.smoke.test.ts`

Files: `index.html`, `styles.css`, `app.js`, `api.js`, `config.js`, `scripts/write-config.mjs`, `payments/*`.
