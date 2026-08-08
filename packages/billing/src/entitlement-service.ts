import type { Entitlements } from "@wingman/domain";
import type { BillingStateStore } from "./store.js";
import { MemoryBillingStateStore } from "./store.js";
import { CachedBillingStateStore } from "./durable-store.js";
import {
  entitlementsFromPlan,
  planFromBilling,
  type EntitlementSnapshot,
  type PlanCode,
} from "./types.js";

/**
 * Entitlement Service — single authority for effective rights.
 * Protocol modules call forUser(userId, now); never Stripe, never client isPremium.
 */
export class EntitlementService {
  constructor(private readonly store: BillingStateStore) {}

  async forUser(userId: string, now: Date): Promise<EntitlementSnapshot> {
    const state = await this.store.get(userId);
    const plan = planFromBilling(state, now);
    return entitlementsFromPlan(plan, state);
  }

  /**
   * Sync adapter for WingmanEngine.entitlementsForUser.
   * Requires MemoryBillingStateStore or CachedBillingStateStore.
   */
  forUserSync(userId: string, now: Date): Entitlements {
    let state;
    if (this.store instanceof CachedBillingStateStore) state = this.store.getSync(userId);
    else if (this.store instanceof MemoryBillingStateStore) state = this.store.getSync(userId);
    else state = undefined;
    const plan = planFromBilling(state, now);
    return entitlementsFromPlan(plan, state);
  }

  async planFor(userId: string, now: Date): Promise<PlanCode> {
    return planFromBilling(await this.store.get(userId), now);
  }
}
