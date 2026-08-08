import { Global, Module, type Provider } from "@nestjs/common";
import {
  BillingReconciler,
  CachedBillingStateStore,
  CachedProcessedEventStore,
  EntitlementService,
  FakeStripeBillingPort,
  MemoryProcessedEventStore,
  PrismaBillingStateStore,
  PrismaProcessedEventStore,
  createStripeBillingPortFromEnv,
  type StripeBillingPort,
} from "@wingman/billing";
import type { PrismaClient } from "@wingman/database";
import { PRISMA_CLIENT } from "../infra/infra.tokens.js";
import { BillingAppService } from "./billing.service.js";
import { BillingController } from "./billing.controller.js";
import {
  BILLING_RECONCILER,
  BILLING_STATE_STORE,
  ENTITLEMENT_SERVICE,
  STRIPE_BILLING_PORT,
} from "./billing.tokens.js";

export type BillingOverrides = {
  stripePort?: StripeBillingPort;
  billingStore?: CachedBillingStateStore;
};

let billingOverrides: BillingOverrides = {};

export function setBillingOverrides(opts: BillingOverrides): void {
  billingOverrides = opts;
}

const storeProvider: Provider = {
  provide: BILLING_STATE_STORE,
  useFactory: (prisma: PrismaClient | null) => {
    if (billingOverrides.billingStore) return billingOverrides.billingStore;
    const durable =
      prisma && typeof (prisma as { billingAccount?: unknown }).billingAccount !== "undefined"
        ? new PrismaBillingStateStore(prisma)
        : undefined;
    return new CachedBillingStateStore(undefined, durable);
  },
  inject: [PRISMA_CLIENT],
};

const stripeProvider: Provider = {
  provide: STRIPE_BILLING_PORT,
  useFactory: async () => {
    if (billingOverrides.stripePort) return billingOverrides.stripePort;
    try {
      return await createStripeBillingPortFromEnv();
    } catch {
      return new FakeStripeBillingPort(process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test");
    }
  },
};

const entitlementsProvider: Provider = {
  provide: ENTITLEMENT_SERVICE,
  useFactory: (store: CachedBillingStateStore) => new EntitlementService(store),
  inject: [BILLING_STATE_STORE],
};

const reconcilerProvider: Provider = {
  provide: BILLING_RECONCILER,
  useFactory: (port: StripeBillingPort, store: CachedBillingStateStore, prisma: PrismaClient | null) => {
    const durableEvents =
      prisma && typeof (prisma as { billingWebhookEvent?: unknown }).billingWebhookEvent !== "undefined"
        ? new PrismaProcessedEventStore(prisma)
        : undefined;
    const processed = new CachedProcessedEventStore(new MemoryProcessedEventStore(), durableEvents);
    return new BillingReconciler(port, store, processed);
  },
  inject: [STRIPE_BILLING_PORT, BILLING_STATE_STORE, PRISMA_CLIENT],
};

@Global()
@Module({
  controllers: [BillingController],
  providers: [
    storeProvider,
    stripeProvider,
    entitlementsProvider,
    reconcilerProvider,
    BillingAppService,
  ],
  exports: [ENTITLEMENT_SERVICE, BILLING_RECONCILER, BILLING_STATE_STORE, STRIPE_BILLING_PORT, BillingAppService],
})
export class BillingModule {}
