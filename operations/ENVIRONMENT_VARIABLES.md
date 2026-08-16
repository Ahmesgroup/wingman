# Environment Variables

**Status:** Decided (V4.1) · Extended for payment readiness (2026-08-12).

Core secrets: `DATABASE_URL`, `REDIS_URL`, `PHONE_LOOKUP_PEPPER`, `PHONE_ENC_KEY` (+ `PHONE_KEY_VERSION`), `MEDIA_BUCKET`,
`MEDIA_KMS_KEY`, `SESSION_SIGNING_KEY`, push provider keys, `POLICY_VERSION`. Secrets are managed via a
secret store, never committed; peppers/keys rotate via versioning.

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
