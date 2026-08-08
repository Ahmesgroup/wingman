import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { WingmanEngine } from "@wingman/domain";
import type {
  BillingReconciler,
  CachedBillingStateStore,
  EntitlementService,
  StripeBillingPort,
} from "@wingman/billing";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import {
  BILLING_RECONCILER,
  BILLING_STATE_STORE,
  ENTITLEMENT_SERVICE,
  STRIPE_BILLING_PORT,
} from "./billing.tokens.js";

@Injectable()
export class BillingAppService implements OnModuleInit {
  constructor(
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlements: EntitlementService,
    @Inject(BILLING_RECONCILER) private readonly reconciler: BillingReconciler,
    @Inject(BILLING_STATE_STORE) private readonly store: CachedBillingStateStore,
    @Inject(STRIPE_BILLING_PORT) private readonly stripe: StripeBillingPort,
    private readonly moduleRef: ModuleRef,
  ) {}

  private engine(): WingmanEngine {
    return this.moduleRef.get<WingmanEngine>(WINGMAN_ENGINE, { strict: false });
  }

  async onModuleInit(): Promise<void> {
    const engine = this.engine();
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
    return this.entitlements.forUser(userId, this.engine().clock.now());
  }

  async handleWebhook(rawBody: Buffer | string, signature: string) {
    try {
      const result = await this.reconciler.handleWebhook(rawBody, signature);
      if (result.ok && !result.duplicate && result.userId) {
        const engine = this.engine();
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
    if (!this.stripe.createCheckoutSession) {
      return { ok: false as const, error: "checkout_unavailable" };
    }
    const state = await this.store.get(userId);
    const session = await this.stripe.createCheckoutSession({
      userId,
      customerId: state?.stripeCustomerId,
      successUrl,
      cancelUrl,
    });
    return { ok: true as const, ...session };
  }

  async createPortal(userId: string, returnUrl: string) {
    const state = await this.store.get(userId);
    if (!state?.stripeCustomerId || !this.stripe.createCustomerPortalSession) {
      return { ok: false as const, error: "portal_unavailable" };
    }
    const session = await this.stripe.createCustomerPortalSession({
      customerId: state.stripeCustomerId,
      returnUrl,
    });
    return { ok: true as const, ...session };
  }
}
