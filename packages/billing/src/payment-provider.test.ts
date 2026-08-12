import { afterEach, describe, expect, it } from "vitest";
import {
  createPaymentProviderFromEnv,
  DisabledPaymentProvider,
  PaymentNotConfiguredError,
  PaymentsDisabledError,
  PaddlePaymentProvider,
  paymentProviderIdFromEnv,
  paymentsEnabledFromEnv,
  StripePaymentProvider,
} from "./payment-provider.js";

afterEach(() => {
  delete process.env.PAYMENTS_ENABLED;
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.WINGMAN_PLUS_PRICE_ID;
  delete process.env.WINGMAN_PLUS_PRODUCT_ID;
  delete process.env.PADDLE_API_KEY;
  delete process.env.PADDLE_WEBHOOK_SECRET;
  delete process.env.PADDLE_CLIENT_TOKEN;
});

describe("payment readiness fail-closed", () => {
  it("defaults to disabled when env unset", () => {
    expect(paymentsEnabledFromEnv({})).toBe(false);
    expect(paymentProviderIdFromEnv({})).toBe("disabled");
  });

  it("DisabledPaymentProvider rejects checkout and portal", async () => {
    const p = new DisabledPaymentProvider();
    expect(p.enabled).toBe(false);
    expect(p.id).toBe("disabled");
    await expect(
      p.createCheckoutSession({
        userId: "u1",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toBeInstanceOf(PaymentsDisabledError);
    await expect(
      p.createCustomerPortalSession({ customerId: "cus_1", returnUrl: "https://example.com" }),
    ).rejects.toBeInstanceOf(PaymentsDisabledError);
  });

  it("factory returns Disabled when PAYMENTS_ENABLED=false even if stripe keys present", async () => {
    const env = {
      PAYMENTS_ENABLED: "false",
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_live_fake",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PUBLISHABLE_KEY: "pk_live_fake",
      WINGMAN_PLUS_PRICE_ID: "price_x",
    };
    const p = await createPaymentProviderFromEnv({
      env,
      stripePort: {
        createCheckoutSession: async () => ({ url: "https://evil", sessionId: "cs_x" }),
      },
    });
    expect(p).toBeInstanceOf(DisabledPaymentProvider);
    await expect(
      p.createCheckoutSession({
        userId: "u1",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      }),
    ).rejects.toMatchObject({ code: "PAYMENTS_DISABLED" });
  });

  it("PAYMENTS_ENABLED=true + stripe + missing credentials → PAYMENT_NOT_CONFIGURED", async () => {
    const env = {
      PAYMENTS_ENABLED: "true",
      PAYMENT_PROVIDER: "stripe",
    };
    await expect(createPaymentProviderFromEnv({ env })).rejects.toBeInstanceOf(
      PaymentNotConfiguredError,
    );
  });

  it("PAYMENTS_ENABLED=true + paddle + missing credentials → PAYMENT_NOT_CONFIGURED", async () => {
    const env = {
      PAYMENTS_ENABLED: "true",
      PAYMENT_PROVIDER: "paddle",
    };
    await expect(createPaymentProviderFromEnv({ env })).rejects.toBeInstanceOf(
      PaymentNotConfiguredError,
    );
  });

  it("never starts a real transaction with defaults", async () => {
    const p = await createPaymentProviderFromEnv({ env: {} });
    expect(p.enabled).toBe(false);
    let charged = false;
    try {
      await p.createCheckoutSession({
        userId: "u1",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      });
      charged = true;
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentsDisabledError);
    }
    expect(charged).toBe(false);
  });

  it("stripe provider only when fully configured", async () => {
    const env = {
      PAYMENTS_ENABLED: "true",
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PUBLISHABLE_KEY: "pk_test_x",
      WINGMAN_PLUS_PRICE_ID: "price_x",
    };
    const p = await createPaymentProviderFromEnv({
      env,
      stripePort: {
        async createCheckoutSession() {
          return { url: "https://checkout.stripe.test/cs", sessionId: "cs_test" };
        },
        async createCustomerPortalSession() {
          return { url: "https://billing.stripe.test/portal" };
        },
      },
    });
    expect(p).toBeInstanceOf(StripePaymentProvider);
    expect(p.enabled).toBe(true);
    const session = await p.createCheckoutSession({
      userId: "u1",
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
    });
    expect(session.sessionId).toBe("cs_test");
  });

  it("paddle assertConfigured rejects incomplete env", () => {
    expect(() => PaddlePaymentProvider.assertConfigured({})).toThrow(PaymentNotConfiguredError);
  });
});
