# Wingman — surface field test (UI)

**Status:** Surface ready · **not** Live Field Test Ready  
**Live UI:** https://wingman-prototype.vercel.app/  
**Build:** `078d308`  
**Next track:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md) (S27–S34)  
**Product path:** open the public URL only — API is configured via `WINGMAN_API_URL` on Vercel (see [`S27_IDENTITY_OTP.md`](./S27_IDENTITY_OTP.md)).

## What this build proves

- Mobile-first **client UI** of the protocol loop is walkable on real phones  
- Payments **disabled**  
- Lab tools (Smoke P4, Offline): **`?qa=1` only** — hidden from ordinary testers  
- With `WINGMAN_API_URL` set + live API: phone → OTP → session (product path). Without API: **unreachable**, not silent “fake auth”

## What this build does **not** prove

Multi-user real OTP, durable DB across redeploy, realtime without refresh, real Radar presence, real selfie media, closed-app push, or server-enforced safety under live users.

That proof is the **Live Field Test** DoD in [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md).

## Tester steps (product / UI)

1. Open https://wingman-prototype.vercel.app/ (**no** `?api=` / `?qa=`)  
2. Optional: Add to Home Screen  
3. Enter phone → follow the app (when API + OTP mode are live)  
4. Or walk Splash → … → Cooldown for UI-only review when product backend is not the goal  
5. Do **not** treat demo nearby users as real people  

## Local Nest (dev)

```bash
AUTH_ALLOW_DEV=true MEASUREMENT_ENABLED=true pnpm --filter @wingman/api dev
npx serve prototype -l 5173
```

`AUTH_ALLOW_DEV` must be **impossible on public production** (S27 gate).

## Redeploy UI

```bash
# Vercel env: WINGMAN_API_URL=https://wingman-api-three.vercel.app
npx vercel --cwd prototype --prod --yes
```
