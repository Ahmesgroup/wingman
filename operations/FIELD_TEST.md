# Wingman — surface field test (UI)

**Status:** Surface ready · **PRODUCT PROTOCOL READY: NO**  
**Live UI:** https://wingman-prototype.vercel.app/  
**API:** https://wingman-api-three.vercel.app/  
**Next track:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md) (S27–S34) · Matrix: [`PROTOCOL_READINESS.md`](./PROTOCOL_READINESS.md)  
**Product path:** open the public URL only — API via `WINGMAN_API_URL` (see [`S27_IDENTITY_OTP.md`](./S27_IDENTITY_OTP.md)).

## What this build proves

- Mobile-first **client UI** of the protocol loop is walkable on real phones  
- Profile **Next** calls `POST /me/profile` (no silent `data-go` skip) when API live  
- Payments **disabled** · Destiny **off**  
- Lab tools (Smoke P4, Offline): **`?qa=1` only**  
- Alone on Radar → nearby=0 (no fake dots)

## What this build does **not** prove

Durable Postgres on current Production (`database=not-configured`), private selfie media, two-phone Signal without refresh in the field, or closed-app push.

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
