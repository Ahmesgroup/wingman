# S32 — Web background / reconnect + push

**Status:** PARTIAL wire (web reconnect) · **BLOCKED** (web push credentials)  
**Date:** 2026-08-18  
**Surfaces:** https://wingman-prototype.vercel.app/ · https://wingman-api-three.vercel.app/  
**PRODUCT PROTOCOL READY:** **NO**  
**S35:** `PRODUCT_PROTOCOL_V2_ENABLED=false` — unchanged; no Signal/Selfie merge.

## What this sprint covers (web product only)

S32 on native (app killed / lock screen / FCM+APNs) remains a later Evidence Pack row. This sprint wires the **existing web / PWA** path:

1. Tab hidden → heartbeat already pauses (presence TTL 120s). Nearby dots are cleared so Radar does not keep showing stale people.
2. Tab visible / online again → restore **server** state: session (`GET /me`), WebSocket reconnect + resume, Radar heartbeat/candidates, Mission connection, chat via `GET /connections/:id/messages`.
3. Transient network errors do **not** look like logout (“Not authenticated”) when tokens are still valid.
4. Web push: permission UX + fail-closed server hook. No invented keys. No fake SENT.

Living Map is the **default** public surface (owner override, this sprint). Canvas Radar remains rollback (`WINGMAN_LIVING_MAP_V1=false` or `?radar=canvas`). Hidden DOM leftover `"0 opportunities nearby"` is i18n’d (`lm_count_zero`).

## Push audit (honest)

| Piece | Present? | Notes |
|-------|----------|--------|
| PWA manifest | yes | `prototype/manifest.webmanifest` |
| Service worker | added | `prototype/sw.js` — display only; registered only if subscribe is attempted |
| `POST /devices/push-token` | yes | S18; platform includes `web` |
| Notification orchestrator | yes | Signal / match / mission / **mission.message** enqueue |
| FCM / APNs ports | yes | Simulated unless `FCM_SERVER_KEY` is set **and** `PUSH_PROVIDER=mobile` |
| VAPID public+private | **no** (this repo / known env names) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_*`, `FCM_VAPID_KEY` |
| Real web-push sender | **no** | Not wired; do not add dummy keys |

`GET /internal/live` now includes:

```json
"webPush": {
  "enabled": false,
  "provider": "none",
  "reason": "vapid_or_fcm_credentials_missing",
  "vapidPublicKey": null
}
```

Public production (`WINGMAN_PUBLIC_PROD=true`) without those credentials uses `FailClosedWebPushTransport`: deliveries go **DEAD**, protocol mutations still succeed (`safeNotify`). Tests keep in-memory transport unless this flag is on.

Client Me → Notifications switch defaults **off**. Turning it on without VAPID/FCM public key stays off and shows a blocked message. Permission denied stays off. Success is only claimed after subscribe + `POST /devices/push-token`.

Notification copy is generic (“Someone nearby reached out”, “New message in your meeting”). No phone numbers, no selfie, no chat text in push payloads.

## BLOCKED (ops)

Web / closed-app **push delivery** is BLOCKED until a coordinator sets **real** credentials (never commit them):

| Variable | Role |
|----------|------|
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Web Push |
| or `WEB_PUSH_VAPID_PUBLIC_KEY` + `WEB_PUSH_VAPID_PRIVATE_KEY` | aliases |
| or `FCM_PROJECT_ID` + `FCM_SERVER_KEY` + `FCM_VAPID_KEY` | FCM web |

Until then: **do not** mark S32 GREEN. Evidence Pack “Signal received with app closed” still needs native or provisioned web push.

## Tests

```bash
node --test prototype/presence-reconnect.test.mjs prototype/web-push.test.mjs prototype/presence-heartbeat.test.mjs prototype/protocol-client.regression.test.mjs prototype/i18n-parity.test.mjs
pnpm --filter @wingman/providers test
pnpm --filter @wingman/api test -- src/s32.web-background.test.ts
```

## Verdict

| Item | Status |
|------|--------|
| Visibility / reconnect / restore | **WIRED** (web) |
| Web push delivery | **BLOCKED** (VAPID/FCM credentials) |
| S32 Evidence Pack | **NOT STARTED** |
| PRODUCT PROTOCOL READY | **NO** |
