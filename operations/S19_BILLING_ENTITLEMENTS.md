# S19 — Billing → Entitlements

**Status:** Implemented · Related: [`implementation/BACKEND_IMPLEMENTATION_STATUS.md`](../implementation/BACKEND_IMPLEMENTATION_STATUS.md)

## Rule

S19 is **Billing → Entitlements**, not “Stripe in the domain”.

```text
Stripe (external facts)
  │
  ▼
Billing Adapter (@wingman/billing StripeBillingPort)
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
| GET | `/billing/entitlements` | user | Effective plan + capabilities |
| POST | `/billing/checkout` | user | Checkout session URL (port) |
| POST | `/billing/portal` | user | Customer portal URL (port) |
| POST | `/billing/webhook` | public + `stripe-signature` | Stripe webhooks |

Enable Nest `rawBody: true` for signature verification in production.

## Env

| Variable | Role |
|----------|------|
| `STRIPE_SECRET_KEY` | Optional — without it, `FakeStripeBillingPort` |
| `STRIPE_WEBHOOK_SECRET` | Webhook HMAC secret (`whsec_…`) |
| `STRIPE_PRICE_ID` | Checkout line item (live port) |
| `DATABASE_URL` | Durable `BillingAccount` / `BillingWebhookEvent` when Prisma is up |

## Gates

```bash
pnpm --filter @wingman/billing test
pnpm --filter @wingman/api test   # billing.e2e + S19 architecture gate
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

## S20

S20 adds **no product features** — production certification only (multi-instance, chaos/recovery, load, observability, go/no-go).
