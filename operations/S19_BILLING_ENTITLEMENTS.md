# S19 — Billing → Entitlements

**Status:** Implemented · Payment readiness extended 2026-08-12 · Related: [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md), [`CLIENT_MOBILE_PAYMENT_READINESS.md`](./CLIENT_MOBILE_PAYMENT_READINESS.md)

## Rule

S19 is **Billing → Entitlements**, not “Stripe in the domain”.

```text
Provider facts (Stripe / Paddle — when enabled)
  │
  ▼
PaymentProvider (@wingman/billing)
 ├── DisabledPaymentProvider   ← DEFAULT (PAYMENTS_ENABLED=false)
 ├── StripePaymentProvider      ← ready, OFF until credentials
 └── PaddlePaymentProvider     ← ready, OFF until credentials
  │
  ▼
Billing Adapter (StripeBillingPort for webhooks when Stripe)
  │  verify signature · idempotence by event.id
  ▼
Billing State (BillingAccount + memory cache)
  │
  ▼
Entitlement Service → entitlements.forUser(userId, now)
  │
  ├── Signal quota
  ├── Connection Ticket limits
  └── Mission Meet duration
```

- Domain / signals / connections / mission / destiny **never** import the Stripe SDK or `@wingman/billing`.
- Clients **never** self-promote via `isPremium` / query flags.
- Effective rights are reconstructed from durable billing state after restart — Stripe is not called per request.
- **No second billing system.** Client payment adapters are dormant; entitlements stay S19-only.

## Plans & capabilities

| Plan | `dailySignals` | `activeConnectionTickets` | Ticket TTL | Mission meet |
|------|----------------|---------------------------|------------|--------------|
| `FREE` | 2 | 1 | free window | free window |
| `WINGMAN_PLUS` | 25 | 3 | plus window | plus window |

Derived from domain `entitlementsFor(wingmanPlus)` plus billing plan/status/dates.

## Webhook events

Handled (verified → billing state → entitlements):

- `checkout.session.completed`
- `customer.subscription.created|updated|deleted`
- `invoice.payment_failed` / `invoice.paid`

**Idempotence:** `BillingWebhookEvent.eventId` (and in-memory cache). A replayed `event.id` is a no-op.

**Cancel at period end:** status `CANCEL_AT_PERIOD_END` keeps Plus until `currentPeriodEnd`, then Free.

**Past due:** keeps Plus until period end (grace), then Free.

## HTTP

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/billing/entitlements` | user | Effective plan + capabilities (+ `payments` status) |
| GET | `/billing/payments/status` | user | `{ paymentsEnabled, provider }` |
| POST | `/billing/checkout` | user | Checkout session URL — **fail-closed when disabled** |
| POST | `/billing/portal` | user | Customer portal URL — fail-closed when disabled |
| POST | `/billing/webhook` | public + `stripe-signature` | Stripe webhooks |

Enable Nest `rawBody: true` for signature verification in production.

## Env

| Variable | Role |
|----------|------|
| `PAYMENTS_ENABLED` | Default `false` — no checkout |
| `PAYMENT_PROVIDER` | `disabled` \| `stripe` \| `paddle` |
| `STRIPE_SECRET_KEY` | Required only when payments enabled + stripe |
| `STRIPE_WEBHOOK_SECRET` | Webhook HMAC secret (`whsec_…`) |
| `STRIPE_PUBLISHABLE_KEY` | Client publishable key (never secret) |
| `WINGMAN_PLUS_PRODUCT_ID` / `WINGMAN_PLUS_PRICE_ID` | Server-side product/price |
| `PADDLE_API_KEY` / `PADDLE_WEBHOOK_SECRET` / `PADDLE_CLIENT_TOKEN` | Required when paddle enabled |
| `PADDLE_ENVIRONMENT` | Default `sandbox` |
| `DATABASE_URL` | Durable `BillingAccount` / `BillingWebhookEvent` when Prisma is up |

Fail-closed:

```text
PAYMENTS_ENABLED=false
  → DisabledPaymentProvider → 503 PAYMENTS_DISABLED on checkout/portal

PAYMENTS_ENABLED=true + credentials missing
  → PAYMENT_NOT_CONFIGURED (no accidental Fake checkout)
```

Card PAN/CVV never touch Wingman. Checkout is hosted by Stripe/Paddle only when a provider is activated later.

## Gates

```bash
pnpm --filter @wingman/billing test
pnpm --filter @wingman/api exec vitest run src/billing.e2e.test.ts
pnpm --filter @wingman/api exec vitest run src/client-loop.smoke.test.ts
```

Exit criteria:

- Free cannot exceed Free capabilities; Plus gets Plus capabilities
- Client cannot self-promote
- Webhook replay has no double effect
- Out-of-order subscription updates converge
- Cancel-at-period-end keeps Plus until `currentPeriodEnd`
- Expiration downgrades automatically
- Invalid Stripe signature / Stripe outage does not break core protocol
- Restart reconstructs entitlements from billing state
- No Stripe SDK in domain / signals / connections / mission / destiny
- Defaults: no real checkout session can start (`PAYMENTS_DISABLED`)

## S20

S20 adds **no product features** — production certification only (multi-instance, chaos/recovery, load, observability, go/no-go).
