import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import type {
  BillingReconciler,
  CachedBillingStateStore,
  EntitlementService,
  PaymentProvider,
  StripeBillingPort,
} from "@wingman/billing";
import {
  PaymentNotConfiguredError,
  PaymentsDisabledError,
} from "@wingman/billing";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import {
  BILLING_RECONCILER,
  BILLING_STATE_STORE,
  ENTITLEMENT_SERVICE,
  PAYMENT_PROVIDER,
  STRIPE_BILLING_PORT,
} from "./billing.tokens.js";

@Injectable()
export class BillingAppService implements OnModuleInit {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly wingman: WingmanEngine,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlements: EntitlementService,
    @Inject(BILLING_RECONCILER) private readonly reconciler: BillingReconciler,
    @Inject(BILLING_STATE_STORE) private readonly store: CachedBillingStateStore,
    @Inject(STRIPE_BILLING_PORT) private readonly stripe: StripeBillingPort,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    const engine = this.wingman;
    engine.setEntitlementsForUser((userId, now) => this.entitlements.forUserSync(userId, now));

    try {
      await this.store.hydrate();
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "billing.hydrate_failed_core_continues",
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    for (const state of await this.store.listAll()) {
      const snap = await this.entitlements.forUser(state.userId, engine.clock.now());
      engine.setWingmanPlus(state.userId, snap.wingmanPlus);
    }
  }

  async entitlementsFor(userId: string) {
    return this.entitlements.forUser(userId, this.wingman.clock.now());
  }

  paymentStatus() {
    return {
      paymentsEnabled: this.payments.enabled,
      provider: this.payments.id,
    };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string) {
    try {
      const result = await this.reconciler.handleWebhook(rawBody, signature);
      if (result.ok && !result.duplicate && result.userId) {
        const engine = this.wingman;
        const snap = await this.entitlements.forUser(result.userId, engine.clock.now());
        engine.setWingmanPlus(result.userId, snap.wingmanPlus);
      }
      return result;
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "webhook_processing_failed",
      };
    }
  }

  async createCheckout(userId: string, successUrl: string, cancelUrl: string) {
    const state = await this.store.get(userId);
    try {
      const session = await this.payments.createCheckoutSession({
        userId,
        customerId: state?.stripeCustomerId,
        successUrl,
        cancelUrl,
      });
      return { ok: true as const, ...session };
    } catch (e) {
      this.mapPaymentError(e);
    }
  }

  async createPortal(userId: string, returnUrl: string) {
    const state = await this.store.get(userId);
    if (!state?.stripeCustomerId) {
      throw new BadRequestException({
        error: { code: "PORTAL_UNAVAILABLE", message: "No billing customer for user" },
      });
    }
    try {
      const session = await this.payments.createCustomerPortalSession({
        customerId: state.stripeCustomerId,
        returnUrl,
      });
      return { ok: true as const, ...session };
    } catch (e) {
      this.mapPaymentError(e);
    }
  }

  private mapPaymentError(e: unknown): never {
    if (e instanceof PaymentsDisabledError) {
      throw new ServiceUnavailableException({
        error: { code: "PAYMENTS_DISABLED", message: e.message },
      });
    }
    if (e instanceof PaymentNotConfiguredError) {
      throw new ServiceUnavailableException({
        error: { code: "PAYMENT_NOT_CONFIGURED", message: e.message },
      });
    }
    throw e instanceof Error
      ? new ServiceUnavailableException({
          error: { code: "PAYMENT_ERROR", message: e.message },
        })
      : new ServiceUnavailableException({
          error: { code: "PAYMENT_ERROR", message: "payment_failed" },
        });
  }
}
