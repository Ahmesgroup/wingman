# Wingman — surface field test (UI)

**Status:** Surface ready · **not** Live Field Test Ready  
**Live UI:** https://wingman-prototype.vercel.app/  
**Build:** `078d308`  
**Next track:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md) (S27–S34)

## What this build proves

- Mobile-first **client UI** of the protocol loop is walkable on real phones  
- Payments **disabled**  
- On Vercel without a public Nest API → **demo/mock** (OK for UI / fluidity / a11y)  
- Lab tools (Smoke P4, Offline): **`?qa=1` only** — hidden from ordinary testers  

## What this build does **not** prove

Multi-user real OTP, durable DB across redeploy, realtime without refresh, real Radar presence, real selfie media, closed-app push, or server-enforced safety under live users.

That proof is the **Live Field Test** DoD in [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md).

## Tester steps (UI surface only)

1. Open https://wingman-prototype.vercel.app/  
2. Optional: Add to Home Screen  
3. Walk Splash → … → Cooldown → Radar  
4. Log UI findings per [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md) if still open  
5. Do **not** treat mock nearby users as real people  

## Local Nest (dev)

```bash
AUTH_ALLOW_DEV=true MEASUREMENT_ENABLED=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
```

`AUTH_ALLOW_DEV` must be **impossible on public production** (S27 gate).

## Redeploy UI

```bash
npx vercel --cwd prototype --prod --yes
```
