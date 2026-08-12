/**
 * Stripe-shaped facts after cryptographic verification.
 * Domain/billing state never import the Stripe SDK — only this port.
 */
export type StripeEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.payment_failed"
  | "invoice.paid"
  | string;

export interface StripeSubscriptionFact {
  id: string;
  customerId: string;
  status: "active" | "past_due" | "canceled" | "incomplete" | "trialing" | "unpaid" | string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Wingman userId from subscription metadata */
  userId?: string;
}

export interface StripeCheckoutFact {
  sessionId: string;
  customerId: string;
  subscriptionId?: string;
  userId?: string;
}

export interface VerifiedStripeEvent {
  id: string;
  type: StripeEventType;
  created: number;
  subscription?: StripeSubscriptionFact;
  checkout?: StripeCheckoutFact;
  customerId?: string;
  raw?: unknown;
}

export interface StripeBillingPort {
  /**
   * Verify webhook signature and parse into VerifiedStripeEvent.
   * Throws on invalid signature.
   */
  verifyAndParseWebhook(rawBody: Buffer | string, signatureHeader: string): Promise<VerifiedStripeEvent>;

  createCheckoutSession?(input: {
    userId: string;
    customerId?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }>;

  createCustomerPortalSession?(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
}

/** HMAC-SHA256 style verifier stub for tests / local (no Stripe SDK). */
export class FakeStripeBillingPort implements StripeBillingPort {
  private secret: string;
  /** Injected events by constructing VerifiedStripeEvent externally via parseInjected. */
  constructor(secret = "whsec_test") {
    this.secret = secret;
  }

  get webhookSecret(): string {
    return this.secret;
  }

  async verifyAndParseWebhook(
    rawBody: Buffer | string,
    signatureHeader: string,
  ): Promise<VerifiedStripeEvent> {
    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    if (!signatureHeader || !signatureHeader.includes("t=") || !signatureHeader.includes("v1=")) {
      throw new Error("Invalid Stripe signature header");
    }
    // Fake: signature must equal `v1=${secret}` substring for tests
    if (!signatureHeader.includes(`v1=${this.secret}`)) {
      throw new Error("Stripe signature verification failed");
    }
    const parsed = JSON.parse(body) as VerifiedStripeEvent & { data?: { object?: Record<string, unknown> } };
    if (parsed.id && parsed.type) {
      return normalizeFakeEvent(parsed);
    }
    throw new Error("Invalid Stripe event payload");
  }

  async createCheckoutSession(input: {
    userId: string;
    customerId?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    const sessionId = `cs_test_${input.userId}`;
    return { url: `${input.successUrl}?session_id=${sessionId}`, sessionId };
  }

  async createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    return { url: `${input.returnUrl}?portal=${input.customerId}` };
  }
}

function coerceDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

function normalizeFakeEvent(parsed: VerifiedStripeEvent & { data?: { object?: Record<string, unknown> } }): VerifiedStripeEvent {
  if (parsed.subscription || parsed.checkout) {
    if (parsed.subscription) {
      parsed.subscription = {
        ...parsed.subscription,
        currentPeriodStart: coerceDate(parsed.subscription.currentPeriodStart, new Date()),
        currentPeriodEnd: coerceDate(
          parsed.subscription.currentPeriodEnd,
          new Date(Date.now() + 30 * 86400000),
        ),
      };
    }
    return parsed;
  }
  const obj = parsed.data?.object ?? {};
  if (parsed.type.startsWith("customer.subscription") || parsed.type === "customer.subscription.deleted") {
    return {
      id: parsed.id,
      type: parsed.type,
      created: parsed.created ?? 0,
      customerId: String(obj.customer ?? ""),
      subscription: {
        id: String(obj.id ?? ""),
        customerId: String(obj.customer ?? ""),
        status: String(obj.status ?? "active"),
        cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
        currentPeriodStart: new Date(Number(obj.current_period_start ?? 0) * 1000),
        currentPeriodEnd: new Date(Number(obj.current_period_end ?? 0) * 1000),
        userId: (obj.metadata as { userId?: string } | undefined)?.userId,
      },
    };
  }
  if (parsed.type === "checkout.session.completed") {
    return {
      id: parsed.id,
      type: parsed.type,
      created: parsed.created ?? 0,
      customerId: String(obj.customer ?? ""),
      checkout: {
        sessionId: String(obj.id ?? ""),
        customerId: String(obj.customer ?? ""),
        subscriptionId: obj.subscription ? String(obj.subscription) : undefined,
        userId: (obj.metadata as { userId?: string } | undefined)?.userId,
      },
    };
  }
  if (parsed.type.startsWith("invoice.")) {
    return {
      id: parsed.id,
      type: parsed.type,
      created: parsed.created ?? 0,
      customerId: String(obj.customer ?? ""),
      subscription: obj.subscription
        ? {
            id: String(obj.subscription),
            customerId: String(obj.customer ?? ""),
            status: parsed.type === "invoice.payment_failed" ? "past_due" : "active",
            cancelAtPeriodEnd: false,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
            userId: (obj.metadata as { userId?: string } | undefined)?.userId,
          }
        : undefined,
    };
  }
  return { id: parsed.id, type: parsed.type, created: parsed.created ?? 0, customerId: String(obj.customer ?? "") };
}

/**
 * Production-shaped Stripe port: uses Stripe SDK only when STRIPE_SECRET_KEY is set
 * AND PAYMENTS_ENABLED=true (payment-ready fail-closed).
 * Loaded dynamically so domain/protocol never pull in stripe (optional peer).
 *
 * When payments are disabled, returns FakeStripe for webhook tests only —
 * checkout must go through PaymentProvider (Disabled by default).
 */
export async function createStripeBillingPortFromEnv(): Promise<StripeBillingPort> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test";
  const paymentsOn = process.env.PAYMENTS_ENABLED === "true";
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!paymentsOn || !apiKey) {
    return new FakeStripeBillingPort(secret);
  }
  try {
    const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<{
      default: new (key: string, opts?: object) => ConstructorParameters<typeof LiveStripeBillingPort>[0];
    }>;
    const { default: Stripe } = await dynImport("stripe");
    const stripe = new Stripe(apiKey, { apiVersion: "2024-11-20.acacia" });
    return new LiveStripeBillingPort(stripe, secret);
  } catch {
    // Fail closed for live checkout path: do not pretend Fake is live Stripe.
    throw new Error("PAYMENT_NOT_CONFIGURED: Stripe SDK unavailable while PAYMENTS_ENABLED=true");
  }
}

/** Minimal live adapter — stripe package is optional peer. */
export class LiveStripeBillingPort implements StripeBillingPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private readonly stripe: { webhooks: { constructEvent: (b: string | Buffer, s: string, sec: string) => unknown }; checkout: { sessions: { create: (o: unknown) => Promise<{ id: string; url: string | null }> } }; billingPortal: { sessions: { create: (o: unknown) => Promise<{ url: string }> } } },
    private readonly webhookSecret: string,
  ) {}

  async verifyAndParseWebhook(rawBody: Buffer | string, signatureHeader: string): Promise<VerifiedStripeEvent> {
    const event = this.stripe.webhooks.constructEvent(rawBody, signatureHeader, this.webhookSecret) as {
      id: string;
      type: string;
      created: number;
      data: { object: Record<string, unknown> };
    };
    return normalizeFakeEvent({
      id: event.id,
      type: event.type,
      created: event.created,
      data: event.data,
    });
  }

  async createCheckoutSession(input: {
    userId: string;
    customerId?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer: input.customerId,
      client_reference_id: input.userId,
      metadata: { userId: input.userId },
      line_items: [
        {
          price: process.env.WINGMAN_PLUS_PRICE_ID || process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
    });
    return { url: session.url ?? "", sessionId: session.id };
  }

  async createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }
}
