import { entitlementsFor, type Entitlements } from "@wingman/domain";

export type PlanCode = "FREE" | "WINGMAN_PLUS";

export type BillingStatus =
  | "NONE"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "CANCEL_AT_PERIOD_END"
  | "INCOMPLETE";

export type BillingSource = "STRIPE" | "ADMIN" | "SEED";

/** Durable billing facts — never protocol rules. */
export interface BillingState {
  userId: string;
  plan: PlanCode;
  status: BillingStatus;
  source: BillingSource;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  updatedAt: Date;
}

export interface EntitlementSnapshot extends Entitlements {
  plan: PlanCode;
  status: BillingStatus;
  effectiveUntil?: Date;
  source: BillingSource;
}

export function asDate(value: Date | string | number | undefined | null): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function planFromBilling(state: BillingState | undefined, now: Date): PlanCode {
  if (!state) return "FREE";
  if (state.plan !== "WINGMAN_PLUS") return "FREE";
  const periodEnd = asDate(state.currentPeriodEnd);
  if (state.status === "ACTIVE" || state.status === "CANCEL_AT_PERIOD_END" || state.status === "PAST_DUE") {
    if (periodEnd && now.getTime() >= periodEnd.getTime()) {
      return "FREE";
    }
    // PAST_DUE keeps Plus until period end (grace), then FREE
    return "WINGMAN_PLUS";
  }
  if (state.status === "CANCELED") {
    if (periodEnd && now.getTime() < periodEnd.getTime()) {
      return "WINGMAN_PLUS";
    }
    return "FREE";
  }
  return "FREE";
}

export function entitlementsFromPlan(plan: PlanCode, state?: BillingState): EntitlementSnapshot {
  const plus = plan === "WINGMAN_PLUS";
  const base = entitlementsFor(plus);
  return {
    ...base,
    plan,
    status: state?.status ?? "NONE",
    effectiveUntil: state?.currentPeriodEnd,
    source: state?.source ?? "SEED",
  };
}
