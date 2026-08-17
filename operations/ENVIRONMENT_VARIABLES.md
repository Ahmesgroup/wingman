# Environment Variables

**Status:** Decided (V4.1) · Extended for payment readiness (2026-08-12).

Core secrets: `DATABASE_URL` (or `POSTGRES_PRISMA_URL` on Vercel/Neon), `REDIS_URL`, `PHONE_LOOKUP_PEPPER`, `PHONE_ENC_KEY` (+ `PHONE_KEY_VERSION`), `MEDIA_BUCKET`,
`MEDIA_KMS_KEY`, `SESSION_SIGNING_KEY`, push provider keys, `POLICY_VERSION`. Secrets are managed via a
secret store, never committed; peppers/keys rotate via versioning.

## Persistence / ephemeral (S28)

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | unset | Required when `WINGMAN_PUBLIC_PROD=true` (no memory fallback) |
| `POSTGRES_PRISMA_URL` | unset | Preferred over `DATABASE_URL` for Prisma when set (Neon/Vercel) |
| `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING` | unset | Prefer for `prisma migrate deploy` |
| `REDIS_URL` | unset | Required when `WINGMAN_PUBLIC_PROD=true` (no memory ephemeral fallback) |
| `WINGMAN_PUBLIC_PROD` | unset | When `true`, missing/unreachable Postgres or Redis aborts boot |

See [`S28_PRODUCTION_PERSISTENCE.md`](./S28_PRODUCTION_PERSISTENCE.md).

## Media / selfies (S31)

| Variable | Default | Notes |
|----------|---------|-------|
| `MEDIA_PROVIDER` | `memory` (local) | `memory` \| `vercel_blob`. Public prod requires `vercel_blob`. |
| `BLOB_READ_WRITE_TOKEN` | unset | Vercel Blob RW token (private store) |
| `MEDIA_BLOB_READ_WRITE_TOKEN` | unset | Optional alias for `BLOB_READ_WRITE_TOKEN` |

See [`S31_PRIVATE_SELFIE_MEDIA.md`](./S31_PRIVATE_SELFIE_MEDIA.md).

## Payments (fail-closed defaults)

| Variable | Default | Notes |
|----------|---------|-------|
| `PAYMENTS_ENABLED` | `false` | Must stay false until sandbox cert + credentials |
| `PAYMENT_PROVIDER` | `disabled` | `disabled` \| `stripe` \| `paddle` |
| `STRIPE_SECRET_KEY` | empty | Server only; required if stripe enabled |
| `STRIPE_WEBHOOK_SECRET` | empty | Webhook HMAC |
| `STRIPE_PUBLISHABLE_KEY` | empty | Client publishable only |
| `PADDLE_API_KEY` | empty | Server only |
| `PADDLE_WEBHOOK_SECRET` | empty | |
| `PADDLE_CLIENT_TOKEN` | empty | Client token only |
| `PADDLE_ENVIRONMENT` | `sandbox` | |
| `WINGMAN_PLUS_PRODUCT_ID` | empty | Server-determined product |
| `WINGMAN_PLUS_PRICE_ID` | empty | Server-determined price |

See [`S19_BILLING_ENTITLEMENTS.md`](./S19_BILLING_ENTITLEMENTS.md) and [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md).

## Measurement (baseline)

| Variable | Default | Notes |
|----------|---------|-------|
| `MEASUREMENT_ENABLED` | ops choice | Observe-only when `true` |
| `MEASUREMENT_LEARNING_ENABLED` | `false` | Must stay false until S26 Review |

See [`PROJECT_STATE.md`](./PROJECT_STATE.md).

## Dev client

| Variable | Default | Notes |
|----------|---------|-------|
| `AUTH_ALLOW_DEV` | e2e `true` | Allows `x-user-id` for prototype / smoke — **must be false** on public field-test / prod |
| `AUTH_FIELD_TEST_MODE` | `false` | When `true`: allow-list + fixed OTP, **no SMS** (S27A). Never combine with `AUTH_ALLOW_DEV=true` on public API |
| `FIELD_TEST_OTP_CODE` | empty | 6-digit coordinator code (Sensitive). Required if field-test mode |
| `FIELD_TEST_PHONE_ALLOWLIST` | empty | Comma-separated E.164 numbers allowed to auth in field-test mode |
| `AUTH_DEBUG_OTP` | unset/`false` | Never expose OTP in HTTP on public builds |
| `AUTH_PEPPER` | required | Session/OTP hashing pepper |
| `OTP_PROVIDER` | `local` | `local` = AuthService code + `SmsProvider`; `twilio_verify` = Twilio Verify (S27B). Field-test mode overrides |
| `TWILIO_ACCOUNT_SID` | empty | Twilio account (server only; never commit) |
| `TWILIO_AUTH_TOKEN` | empty | Twilio auth token (server only; never commit) |
| `TWILIO_VERIFY_SERVICE_SID` | empty | Verify Service SID `VA…` required when `OTP_PROVIDER=twilio_verify` |
| `TWILIO_FROM_E164` | empty | From number for `SMS_PROVIDER=twilio` Programmable SMS only — **not** required for Verify OTP |
| `SMS_PROVIDER` | `console` | `console` \| `noop` \| `twilio` (Programmable SMS port; separate from Verify OTP) |

## Public web client (`wingman-prototype`)

| Variable | Default | Notes |
|----------|---------|-------|
| `WINGMAN_API_URL` | empty | **Production/Preview on Vercel.** HTTPS origin of Nest API (e.g. `https://wingman-api-three.vercel.app`). Baked into `config.js` at build via `prototype/scripts/write-config.mjs`. Testers never set this; no `?api=` on the public product URL. |
| `WINGMAN_LIVING_MAP_V1` | `false` | Living Map UI as default Radar. Must stay false on public Production until field verification. Testers can opt in with `?livingMap=1` without enabling this for everyone. |

Local prototype without the var → `http://localhost:3000`. Overrides `?api=` / `localStorage.wingman_api_base` only on localhost or `?qa=1`.

