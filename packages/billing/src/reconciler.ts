import type { BillingStateStore, ProcessedEventStore } from "./store.js";
import type { StripeBillingPort, VerifiedStripeEvent } from "./stripe-port.js";
import { asDate, type BillingState, type BillingStatus, type PlanCode } from "./types.js";

export type ReconcileResult =
  | { ok: true; duplicate: true; eventId: string }
  | { ok: true; duplicate: false; eventId: string; userId?: string; state?: BillingState }
  | { ok: false; error: string };

/**
 * Stripe → Billing Adapter → Billing State.
 * EntitlementService derives rights from BillingState afterwards.
 */
export class BillingReconciler {
  constructor(
    private readonly port: StripeBillingPort,
    private readonly states: BillingStateStore,
    private readonly processed: ProcessedEventStore,
  ) {}

  async handleWebhook(rawBody: Buffer | string, signatureHeader: string): Promise<ReconcileResult> {
    let event: VerifiedStripeEvent;
    try {
      event = await this.port.verifyAndParseWebhook(rawBody, signatureHeader);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "verify_failed" };
    }
    return this.applyVerifiedEvent(event);
  }

  /** Test / recovery path with already-verified events. */
  async applyVerifiedEvent(event: VerifiedStripeEvent): Promise<ReconcileResult> {
    if (await this.processed.wasProcessed(event.id)) {
      return { ok: true, duplicate: true, eventId: event.id };
    }

    const state = await this.reconcile(event);
    await this.processed.markProcessed(event.id, event.type, new Date());
    return { ok: true, duplicate: false, eventId: event.id, userId: state?.userId, state };
  }

  private async reconcile(event: VerifiedStripeEvent): Promise<BillingState | undefined> {
    switch (event.type) {
      case "checkout.session.completed":
        return this.onCheckout(event);
      case "customer.subscription.created":
      case "customer.subscription.updated":
        return this.onSubscriptionUpsert(event);
      case "customer.subscription.deleted":
        return this.onSubscriptionDeleted(event);
      case "invoice.payment_failed":
        return this.onPaymentFailed(event);
      case "invoice.paid":
        return this.onInvoicePaid(event);
      default:
        return undefined;
    }
  }

  private async resolveUserId(event: VerifiedStripeEvent): Promise<string | undefined> {
    const fromMeta =
      event.checkout?.userId ?? event.subscription?.userId;
    if (fromMeta) return fromMeta;
    if (event.subscription?.id) {
      const bySub = await this.states.getBySubscriptionId(event.subscription.id);
      if (bySub) return bySub.userId;
    }
    const customerId = event.customerId ?? event.checkout?.customerId ?? event.subscription?.customerId;
    if (customerId) {
      const byCust = await this.states.getByStripeCustomerId(customerId);
      if (byCust) return byCust.userId;
    }
    return undefined;
  }

  private async onCheckout(event: VerifiedStripeEvent): Promise<BillingState | undefined> {
    const userId = await this.resolveUserId(event);
    if (!userId || !event.checkout) return undefined;
    const existing = await this.states.get(userId);
    const now = new Date();
    const periodEnd = existing?.currentPeriodEnd ?? new Date(now.getTime() + 30 * 86400000);
    const next: BillingState = {
      userId,
      plan: "WINGMAN_PLUS",
      status: "ACTIVE",
      source: "STRIPE",
      stripeCustomerId: event.checkout.customerId || existing?.stripeCustomerId,
      stripeSubscriptionId: event.checkout.subscriptionId ?? existing?.stripeSubscriptionId,
      currentPeriodStart: existing?.currentPeriodStart ?? now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    };
    await this.states.upsert(next);
    return next;
  }

  private mapSubStatus(status: string, cancelAtPeriodEnd: boolean): { plan: PlanCode; status: BillingStatus } {
    if (cancelAtPeriodEnd && (status === "active" || status === "trialing")) {
      return { plan: "WINGMAN_PLUS", status: "CANCEL_AT_PERIOD_END" };
    }
    switch (status) {
      case "active":
      case "trialing":
        return { plan: "WINGMAN_PLUS", status: "ACTIVE" };
      case "past_due":
      case "unpaid":
        return { plan: "WINGMAN_PLUS", status: "PAST_DUE" };
      case "canceled":
        return { plan: "WINGMAN_PLUS", status: "CANCELED" };
      case "incomplete":
        return { plan: "FREE", status: "INCOMPLETE" };
      default:
        return { plan: "FREE", status: "NONE" };
    }
  }

  private async onSubscriptionUpsert(event: VerifiedStripeEvent): Promise<BillingState | undefined> {
    const sub = event.subscription;
    if (!sub) return undefined;
    const userId = await this.resolveUserId(event);
    if (!userId) return undefined;
    const existing = await this.states.get(userId);
    const periodStart = asDate(sub.currentPeriodStart) ?? new Date();
    const periodEnd = asDate(sub.currentPeriodEnd) ?? new Date(periodStart.getTime() + 30 * 86400000);
    const existingEnd = asDate(existing?.currentPeriodEnd);
    // Out-of-order guard: ignore older period ends that regress an already newer state
    if (
      existingEnd &&
      periodEnd.getTime() < existingEnd.getTime() &&
      asDate(existing?.updatedAt)!.getTime() > new Date(event.created * 1000).getTime()
    ) {
      return existing;
    }
    const mapped = this.mapSubStatus(sub.status, sub.cancelAtPeriodEnd);
    const next: BillingState = {
      userId,
      plan: mapped.plan,
      status: mapped.status,
      source: "STRIPE",
      stripeCustomerId: sub.customerId || existing?.stripeCustomerId,
      stripeSubscriptionId: sub.id,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      updatedAt: new Date(),
    };
    await this.states.upsert(next);
    return next;
  }

  private async onSubscriptionDeleted(event: VerifiedStripeEvent): Promise<BillingState | undefined> {
    const sub = event.subscription;
    const userId = await this.resolveUserId(event);
    if (!userId) return undefined;
    const existing = await this.states.get(userId);
    const periodEnd = asDate(sub?.currentPeriodEnd) ?? asDate(existing?.currentPeriodEnd);
    const next: BillingState = {
      userId,
      plan: "WINGMAN_PLUS",
      status: "CANCELED",
      source: "STRIPE",
      stripeCustomerId: sub?.customerId ?? existing?.stripeCustomerId,
      stripeSubscriptionId: sub?.id ?? existing?.stripeSubscriptionId,
      currentPeriodStart: existing?.currentPeriodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    };
    await this.states.upsert(next);
    return next;
  }

  private async onPaymentFailed(event: VerifiedStripeEvent): Promise<BillingState | undefined> {
    const userId = await this.resolveUserId(event);
    if (!userId) return undefined;
    const existing = await this.states.get(userId);
    if (!existing) return undefined;
    const next: BillingState = {
      ...existing,
      status: "PAST_DUE",
      plan: "WINGMAN_PLUS",
      updatedAt: new Date(),
    };
    await this.states.upsert(next);
    return next;
  }

  private async onInvoicePaid(event: VerifiedStripeEvent): Promise<BillingState | undefined> {
    const userId = await this.resolveUserId(event);
    if (!userId) return undefined;
    const existing = await this.states.get(userId);
    if (!existing) return undefined;
    const next: BillingState = {
      ...existing,
      status: existing.cancelAtPeriodEnd ? "CANCEL_AT_PERIOD_END" : "ACTIVE",
      plan: "WINGMAN_PLUS",
      updatedAt: new Date(),
    };
    await this.states.upsert(next);
    return next;
  }
}
