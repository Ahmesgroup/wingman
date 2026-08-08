import type { PrismaClient } from "@prisma/client";
import type { BillingState } from "./types.js";
import type { BillingStateStore, ProcessedEventStore } from "./store.js";
import { MemoryBillingStateStore, MemoryProcessedEventStore } from "./store.js";

function rowToState(row: {
  userId: string;
  plan: string;
  status: string;
  source: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: Date;
}): BillingState {
  return {
    userId: row.userId,
    plan: row.plan as BillingState["plan"],
    status: row.status as BillingState["status"],
    source: row.source as BillingState["source"],
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    currentPeriodStart: row.currentPeriodStart ?? undefined,
    currentPeriodEnd: row.currentPeriodEnd ?? undefined,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    updatedAt: row.updatedAt,
  };
}

/** Durable Prisma store — used behind CachedBillingStateStore. */
export class PrismaBillingStateStore implements BillingStateStore {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<BillingState | undefined> {
    const row = await this.prisma.billingAccount.findUnique({ where: { userId } });
    return row ? rowToState(row) : undefined;
  }

  async getByStripeCustomerId(customerId: string): Promise<BillingState | undefined> {
    const row = await this.prisma.billingAccount.findFirst({ where: { stripeCustomerId: customerId } });
    return row ? rowToState(row) : undefined;
  }

  async getBySubscriptionId(subscriptionId: string): Promise<BillingState | undefined> {
    const row = await this.prisma.billingAccount.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
    });
    return row ? rowToState(row) : undefined;
  }

  async upsert(state: BillingState): Promise<void> {
    await this.prisma.billingAccount.upsert({
      where: { userId: state.userId },
      create: {
        userId: state.userId,
        plan: state.plan,
        status: state.status,
        source: state.source,
        stripeCustomerId: state.stripeCustomerId,
        stripeSubscriptionId: state.stripeSubscriptionId,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      },
      update: {
        plan: state.plan,
        status: state.status,
        source: state.source,
        stripeCustomerId: state.stripeCustomerId,
        stripeSubscriptionId: state.stripeSubscriptionId,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd,
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      },
    });
  }

  async listAll(): Promise<BillingState[]> {
    const rows = await this.prisma.billingAccount.findMany();
    return rows.map(rowToState);
  }
}

export class PrismaProcessedEventStore implements ProcessedEventStore {
  constructor(private readonly prisma: PrismaClient) {}

  async wasProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.billingWebhookEvent.findUnique({ where: { eventId } });
    return Boolean(row);
  }

  async markProcessed(eventId: string, type: string, at: Date): Promise<void> {
    await this.prisma.billingWebhookEvent.upsert({
      where: { eventId },
      create: { eventId, type, processedAt: at },
      update: {},
    });
  }
}

/**
 * Memory hot cache + optional durable mirror.
 * Engine sync reads use memory; restart hydrates from durable.
 */
export class CachedBillingStateStore implements BillingStateStore {
  readonly memory: MemoryBillingStateStore;

  constructor(
    memory?: MemoryBillingStateStore,
    private readonly durable?: BillingStateStore,
  ) {
    this.memory = memory ?? new MemoryBillingStateStore();
  }

  getSync(userId: string): BillingState | undefined {
    return this.memory.getSync(userId);
  }

  async hydrate(): Promise<number> {
    if (!this.durable) return 0;
    const all = await this.durable.listAll();
    for (const s of all) await this.memory.upsert(s);
    return all.length;
  }

  async get(userId: string): Promise<BillingState | undefined> {
    return this.memory.get(userId);
  }

  async getByStripeCustomerId(customerId: string): Promise<BillingState | undefined> {
    return this.memory.getByStripeCustomerId(customerId);
  }

  async getBySubscriptionId(subscriptionId: string): Promise<BillingState | undefined> {
    return this.memory.getBySubscriptionId(subscriptionId);
  }

  async upsert(state: BillingState): Promise<void> {
    await this.memory.upsert(state);
    try {
      await this.durable?.upsert(state);
    } catch {
      // Stripe/billing outage of DB write must not break webhook ack path after memory upsert —
      // caller may retry; memory remains source for this process.
    }
  }

  async listAll(): Promise<BillingState[]> {
    return this.memory.listAll();
  }
}

export class CachedProcessedEventStore implements ProcessedEventStore {
  constructor(
    private readonly memory: MemoryProcessedEventStore = new MemoryProcessedEventStore(),
    private readonly durable?: ProcessedEventStore,
  ) {}

  async wasProcessed(eventId: string): Promise<boolean> {
    if (await this.memory.wasProcessed(eventId)) return true;
    if (this.durable && (await this.durable.wasProcessed(eventId))) {
      await this.memory.markProcessed(eventId, "hydrated", new Date());
      return true;
    }
    return false;
  }

  async markProcessed(eventId: string, type: string, at: Date): Promise<void> {
    await this.memory.markProcessed(eventId, type, at);
    try {
      await this.durable?.markProcessed(eventId, type, at);
    } catch {
      // same as state store — memory wins for process lifetime
    }
  }
}
