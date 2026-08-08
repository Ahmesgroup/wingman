import type { BillingState } from "./types.js";

export interface BillingStateStore {
  get(userId: string): Promise<BillingState | undefined>;
  getByStripeCustomerId(customerId: string): Promise<BillingState | undefined>;
  getBySubscriptionId(subscriptionId: string): Promise<BillingState | undefined>;
  upsert(state: BillingState): Promise<void>;
  listAll(): Promise<BillingState[]>;
}

export interface ProcessedEventStore {
  /** Returns true if this event.id was already processed. */
  wasProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string, at: Date): Promise<void>;
}

export class MemoryBillingStateStore implements BillingStateStore {
  private byUser = new Map<string, BillingState>();
  private byCustomer = new Map<string, string>();
  private bySub = new Map<string, string>();

  /** Sync read for WingmanEngine.entitlementsForUser — reconstructible from upserted state. */
  getSync(userId: string): BillingState | undefined {
    return this.byUser.get(userId);
  }

  async get(userId: string): Promise<BillingState | undefined> {
    return this.getSync(userId);
  }

  async getByStripeCustomerId(customerId: string): Promise<BillingState | undefined> {
    const userId = this.byCustomer.get(customerId);
    return userId ? this.byUser.get(userId) : undefined;
  }

  async getBySubscriptionId(subscriptionId: string): Promise<BillingState | undefined> {
    const userId = this.bySub.get(subscriptionId);
    return userId ? this.byUser.get(userId) : undefined;
  }

  async upsert(state: BillingState): Promise<void> {
    this.byUser.set(state.userId, state);
    if (state.stripeCustomerId) this.byCustomer.set(state.stripeCustomerId, state.userId);
    if (state.stripeSubscriptionId) this.bySub.set(state.stripeSubscriptionId, state.userId);
  }

  async listAll(): Promise<BillingState[]> {
    return [...this.byUser.values()];
  }
}

export class MemoryProcessedEventStore implements ProcessedEventStore {
  private ids = new Map<string, { type: string; at: Date }>();

  async wasProcessed(eventId: string): Promise<boolean> {
    return this.ids.has(eventId);
  }

  async markProcessed(eventId: string, type: string, at: Date): Promise<void> {
    this.ids.set(eventId, { type, at });
  }
}
