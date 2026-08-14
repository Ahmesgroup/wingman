# Wingman — field test (product-ready client)

**Status:** Ready for real-phone review  
**Live UI:** https://wingman-prototype.vercel.app/  
**Checkpoint:** `04e7c4d` (+ deploy/docs after)  
**Verdict protocol:** [`CLIENT_POLISH_REVIEW.md`](./CLIENT_POLISH_REVIEW.md)

## What this build is

- Mobile-first **client UI** of the full protocol loop  
- Payments **disabled**  
- On Vercel: **demo/mock** Nest (no public API) — valid for UI / a11y / fluidity review  
- Lab tools (Smoke P4, Offline sim): add `?qa=1` to the URL  

## Tester steps (phone)

1. Open https://wingman-prototype.vercel.app/ (Safari or Chrome)  
2. Optional: Share → Add to Home Screen  
3. Walk: Splash → Auth → Radar → Signal → Validation → Match → Mission → Outcome → Cooldown → Radar  
4. Also: refresh mid-loop, Offline via `?qa=1`, rotate screen, background/resume  
5. Log findings with: device · viewport · loop step · expected · observed · severity  

## Local Nest loop (optional)

```bash
AUTH_ALLOW_DEV=true MEASUREMENT_ENABLED=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
```

## Redeploy client

```bash
npx vercel --cwd prototype --prod --yes
```
