# S18 — Production providers (SMS + Push)

**Status:** Implemented · Domain and WebSocket transport unchanged

## Principle

```text
Application Events
        │
        ▼
Notification Orchestrator  (@wingman/notifications)
   ├── WebSocket (already published by RealtimeAppService)
   ├── SMS Port ───► Console / Noop / Twilio (+ ReliableSms)
   └── Push Port
        ├── FCM (simulated or HTTP when FCM_SERVER_KEY set)
        └── APNs (simulated)
```

Protocol modules (`signals`, `connections`, `safety`, `destiny`, `domain`) **never** import Twilio/FCM/APNs SDKs or `@wingman/providers`.

## SMS

| Env | Meaning |
|-----|---------|
| `SMS_PROVIDER=console` | Default redacted logger (no OTP body in logs) |
| `SMS_PROVIDER=noop` | Disable SMS |
| `SMS_PROVIDER=twilio` | Live Twilio **Programmable SMS** HTTP (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_E164`) |
| `SMS_MAX_ATTEMPTS` / `SMS_TIMEOUT_MS` | Reliable wrapper bounds |

`ReliableSmsProvider` provides timeout, retries, and idempotence by `idempotencyKey`.

## OTP delivery (S27)

| Env | Meaning |
|-----|---------|
| `AUTH_FIELD_TEST_MODE=true` | S27A: fixed coordinator OTP, no SMS (takes precedence) |
| `OTP_PROVIDER=local` (default) | AuthService generates code; delivery via `SmsProvider` |
| `OTP_PROVIDER=twilio_verify` | **S27B:** Twilio Verify start/check (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`) |

`TWILIO_FROM_E164` is **not** required for Verify OTP. Do not put Account SID / Auth Token / Verify Service SID in source. S27B stays OPEN until real-phone evidence — see [`S27_IDENTITY_OTP.md`](./S27_IDENTITY_OTP.md).

## Push

| Env | Meaning |
|-----|---------|
| `PUSH_PROVIDER=memory` | In-memory transport (tests) |
| `PUSH_PROVIDER=logging` | Log-only |
| `PUSH_PROVIDER=mobile` | FCM + APNs via `MobilePushTransport` + device token registry |
| `PUSH_PROVIDER=web` | Fail-closed until VAPID/FCM credentials exist (`FailClosedWebPushTransport`) |

`GET /internal/live` exposes `{ webPush: { enabled, provider, reason, vapidPublicKey } }` — never private keys.

Without VAPID/FCM credentials, web push is **BLOCKED** (no fake SENT). See [`S32_WEB_BACKGROUND.md`](./S32_WEB_BACKGROUND.md).

Register tokens:

```http
POST /devices/push-token
{ "deviceId": "…", "platform": "ios"|"android"|"web", "pushToken": "…" }
```

Invalid tokens are deactivated automatically (`INVALID_DEVICE`).

## Notification record

`notificationId`, `status` (`PENDING|SENT|FAILED|INVALID_DEVICE|DEAD`), `attempts`, `providerMessageId`, `idempotencyKey`.

`handleAppEvent({ type, userId, aggregateId })` maps application events to push jobs. Provider failures are swallowed by `safeNotify` so Signal/Match/Mission never block.

## Tests

```bash
pnpm --filter @wingman/notifications test
pnpm --filter @wingman/providers test
pnpm --filter @wingman/api test   # includes S18 architecture gate
```
