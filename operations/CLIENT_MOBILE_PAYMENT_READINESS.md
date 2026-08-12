# Client — Mobile-first + Payment readiness

**Status:** Done (2026-08-12) · Commits: `928512f`, `3aaab02`  
**Related:** [`prototype/README.md`](../prototype/README.md), [`S19_BILLING_ENTITLEMENTS.md`](./S19_BILLING_ENTITLEMENTS.md), [`PROJECT_STATE.md`](./PROJECT_STATE.md)

Independent of engine freeze / baseline collection. Does **not** change domain S0–S26.

## What shipped

| Track | Result |
|-------|--------|
| **Mobile-first web client** | [`prototype/`](../prototype/) — 375×812 / 360–412, `100dvh`, safe-area; tokens V4 (night / violet) |
| **Protocol loop ↔ Nest** | Radar → Signal → Connection → Mission → Outcome → Cooldown (dev `x-user-id`) |
| **Payment readiness** | Architecture ready, **activation forbidden** — `DisabledPaymentProvider` default |

## Product loop (client)

```text
Splash → Onboarding → Phone/OTP → Profile → Consent
  → Radar → Signal → Selfie → Confirmed → Ticket
  → Mission Meet → Mission Mode → Outcome → Cooldown → Radar
```

Entitlements **FREE** shown read-only (signals / tickets).  
**No** Upgrade / Buy / Subscribe / price / card / checkout in navigation.

## Payment architecture (fail-closed)

```text
Client
  │  no checkout CTAs while disabled
  ▼
Billing API S19
  │
  ▼
PaymentProvider
 ├── DisabledPaymentProvider   ← DEFAULT
 ├── StripePaymentProvider      ← ready, OFF
 └── PaddlePaymentProvider     ← ready, OFF
        │
        ▼
 EntitlementService (S19 only source of truth)
        │
   FREE / WINGMAN_PLUS
```

Rules:

- No card PAN/CVV through Wingman API, PG, Redis, logs, or analytics.
- Cards / Apple Pay / Google Pay only via Stripe Checkout/Elements or Paddle Checkout when enabled later.
- Amount/product server-side; `success_url` never grants Plus.
- Secrets only in env; never in the client.

### Env (defaults)

```bash
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=disabled   # disabled | stripe | paddle
```

`PAYMENTS_ENABLED=false` → no checkout (`503 PAYMENTS_DISABLED`).  
`PAYMENTS_ENABLED=true` + missing credentials → `PAYMENT_NOT_CONFIGURED` (no Fake checkout fallback).

### Client dormant adapters

```text
prototype/payments/
  payment-client.js
  payment-types.js
  providers/disabled.js   ← default
  providers/stripe.js     ← SDK load blocked until enabled
  providers/paddle.js
```

## Nest helpers used by the client

| Method | Path | Notes |
|--------|------|-------|
| GET | `/billing/entitlements` | Includes `payments: { paymentsEnabled, provider }` |
| GET | `/billing/payments/status` | Fail-closed status |
| POST | `/billing/checkout` | Blocked while disabled |
| POST | `/connections/:id/finish` | `chat_closed` → `OUTCOME_PENDING` (after `lets-meet`) |

## Run locally

```bash
# Terminal 1 — API
AUTH_ALLOW_DEV=true MEASUREMENT_ENABLED=true pnpm --filter @wingman/api dev

# Terminal 2 — client
npx serve prototype -l 5173
# → http://localhost:5173/
```

Client probes `GET /internal/live`; if down → mock/demo mode (banner).

## Gates

```bash
pnpm --filter @wingman/billing test
pnpm --filter @wingman/api exec vitest run src/billing.e2e.test.ts
pnpm --filter @wingman/api exec vitest run src/client-loop.smoke.test.ts
```

- Viewport 375–412 without horizontal overflow
- Loop smoke: Radar → … → Cooldown with `proto-alex` / `proto-peer`
- Checkout remains `503` with defaults
- Domain S0–S26 untouched

## Activation later (out of this sprint)

1. Provide Stripe or Paddle accounts, keys, Product/Price IDs, webhook URLs  
2. Sandbox certification  
3. Only then `PAYMENTS_ENABLED=true` + `PAYMENT_PROVIDER=stripe|paddle`

## Next client work (optional)

Further polish only: richer offline retry, Destiny UI, production auth (OTP session) — **not** engine sprints, **not** enabling payments without credentials.
