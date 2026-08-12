/**
 * PaymentProvider — fail-closed payment readiness layer on top of S19.
 *
 * Default is DisabledPaymentProvider. Stripe/Paddle adapters are ready but
 * never activate without PAYMENTS_ENABLED=true and complete credentials.
 * Wingman never accepts card PAN/CVV; checkout runs only on provider hosts.
 */

export type PaymentProviderId = "disabled" | "stripe" | "paddle";

export class PaymentNotConfiguredError extends Error {
  readonly code = "PAYMENT_NOT_CONFIGURED" as const;
  constructor(message: string) {
    super(message);
    this.name = "PaymentNotConfiguredError";
  }
}

export class PaymentsDisabledError extends Error {
  readonly code = "PAYMENTS_DISABLED" as const;
  constructor(message = "Payments are disabled") {
    super(message);
    this.name = "PaymentsDisabledError";
  }
}

export interface CheckoutSessionInput {
  userId: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface PortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** True only when real checkout may be attempted. */
  readonly enabled: boolean;
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
  createCustomerPortalSession(input: PortalSessionInput): Promise<PortalSessionResult>;
}

/** DEFAULT — no transactions, no SDK, no accidental charge. */
export class DisabledPaymentProvider implements PaymentProvider {
  readonly id = "disabled" as const;
  readonly enabled = false;

  async createCheckoutSession(_input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    throw new PaymentsDisabledError("Checkout unavailable while PAYMENTS_ENABLED=false");
  }

  async createCustomerPortalSession(_input: PortalSessionInput): Promise<PortalSessionResult> {
    throw new PaymentsDisabledError("Portal unavailable while PAYMENTS_ENABLED=false");
  }
}

export function paymentsEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PAYMENTS_ENABLED === "true";
}

export function paymentProviderIdFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PaymentProviderId {
  if (!paymentsEnabledFromEnv(env)) return "disabled";
  const raw = (env.PAYMENT_PROVIDER ?? "disabled").toLowerCase();
  if (raw === "stripe" || raw === "paddle" || raw === "disabled") return raw;
  return "disabled";
}

function requireEnv(env: NodeJS.ProcessEnv, keys: string[]): void {
  const missing = keys.filter((k) => !env[k]?.trim());
  if (missing.length) {
    throw new PaymentNotConfiguredError(
      `PAYMENT_NOT_CONFIGURED: missing ${missing.join(", ")}`,
    );
  }
}

/**
 * Stripe adapter — ready but only constructed when payments are enabled
 * and credentials are complete. Does not load Stripe SDK until then.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  readonly enabled = true;

  constructor(
    private readonly port: {
      createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
      createCustomerPortalSession?(input: PortalSessionInput): Promise<PortalSessionResult>;
    },
  ) {}

  static assertConfigured(env: NodeJS.ProcessEnv = process.env): void {
    requireEnv(env, [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PUBLISHABLE_KEY",
      "WINGMAN_PLUS_PRICE_ID",
    ]);
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    if (!this.port.createCheckoutSession) {
      throw new PaymentNotConfiguredError("Stripe checkout port missing");
    }
    return this.port.createCheckoutSession(input);
  }

  async createCustomerPortalSession(input: PortalSessionInput): Promise<PortalSessionResult> {
    if (!this.port.createCustomerPortalSession) {
      throw new PaymentNotConfiguredError("Stripe portal port missing");
    }
    return this.port.createCustomerPortalSession(input);
  }
}

/**
 * Paddle adapter — ready, OFF until credentials + PAYMENTS_ENABLED.
 * Checkout will use Paddle Checkout (hosted); no card data through Wingman.
 */
export class PaddlePaymentProvider implements PaymentProvider {
  readonly id = "paddle" as const;
  readonly enabled = true;

  constructor(
    private readonly config: {
      apiKey: string;
      clientToken: string;
      environment: string;
      productId: string;
      priceId: string;
      webhookSecret: string;
    },
  ) {}

  static assertConfigured(env: NodeJS.ProcessEnv = process.env): void {
    requireEnv(env, [
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_CLIENT_TOKEN",
      "WINGMAN_PLUS_PRODUCT_ID",
      "WINGMAN_PLUS_PRICE_ID",
    ]);
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    // Hosted checkout URL shape — real Paddle API call when keys are live.
    // Fail-closed: never invent a chargeable session without API confirmation.
    void this.config;
    throw new PaymentNotConfiguredError(
      "Paddle checkout requires live API certification before sessions are issued",
    );
  }

  async createCustomerPortalSession(input: PortalSessionInput): Promise<PortalSessionResult> {
    void input;
    void this.config;
    throw new PaymentNotConfiguredError(
      "Paddle portal requires live API certification before sessions are issued",
    );
  }
}

export type CreatePaymentProviderDeps = {
  env?: NodeJS.ProcessEnv;
  /** Injected live Stripe port when stripe is selected and configured. */
  stripePort?: StripePaymentProvider["port"];
};

/**
 * Factory — fail-closed.
 * - PAYMENTS_ENABLED=false → DisabledPaymentProvider (never throws)
 * - enabled + provider=stripe|paddle + missing creds → PaymentNotConfiguredError
 * - never falls back to a real-looking Fake checkout
 */
export async function createPaymentProviderFromEnv(
  deps: CreatePaymentProviderDeps = {},
): Promise<PaymentProvider> {
  const env = deps.env ?? process.env;
  const id = paymentProviderIdFromEnv(env);

  if (id === "disabled") {
    return new DisabledPaymentProvider();
  }

  if (id === "stripe") {
    StripePaymentProvider.assertConfigured(env);
    if (!deps.stripePort?.createCheckoutSession) {
      throw new PaymentNotConfiguredError(
        "PAYMENT_NOT_CONFIGURED: Stripe port required when PAYMENT_PROVIDER=stripe",
      );
    }
    return new StripePaymentProvider(deps.stripePort);
  }

  if (id === "paddle") {
    PaddlePaymentProvider.assertConfigured(env);
    return new PaddlePaymentProvider({
      apiKey: env.PADDLE_API_KEY!.trim(),
      clientToken: env.PADDLE_CLIENT_TOKEN!.trim(),
      environment: (env.PADDLE_ENVIRONMENT ?? "sandbox").trim(),
      productId: env.WINGMAN_PLUS_PRODUCT_ID!.trim(),
      priceId: env.WINGMAN_PLUS_PRICE_ID!.trim(),
      webhookSecret: env.PADDLE_WEBHOOK_SECRET!.trim(),
    });
  }

  return new DisabledPaymentProvider();
}
