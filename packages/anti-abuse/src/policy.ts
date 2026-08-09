import type {
  AbuseAction,
  EnforcementScope,
  PolicyThresholds,
  RiskLevel,
  RiskSignalName,
} from "./types.js";
import {
  ANTI_ABUSE_POLICY_VERSION,
  DEFAULT_POLICY_THRESHOLDS,
} from "./types.js";

export interface PolicyOutcome {
  action: AbuseAction;
  riskLevel: RiskLevel;
  scopes: EnforcementScope[];
  durationMs: number;
  reasons: string[];
  policyVersion: string;
}

/**
 * Deterministic, versioned policy: named signals → graduated action.
 * No opaque riskScore decides alone.
 */
export function applyAbusePolicy(
  signals: RiskSignalName[],
  thresholds: PolicyThresholds = DEFAULT_POLICY_THRESHOLDS,
): PolicyOutcome {
  const policyVersion = ANTI_ABUSE_POLICY_VERSION;
  if (signals.length === 0) {
    return {
      action: "ALLOW",
      riskLevel: "LOW",
      scopes: [],
      durationMs: 0,
      reasons: ["no_risk_signals"],
      policyVersion,
    };
  }

  const set = new Set(signals);
  const reasons = signals.map((s) => `signal:${s}`);

  // CRITICAL path — still no BAN; TEMP_RESTRICT or CHALLENGE
  if (set.has("impossible_geo_jump") && set.has("signal_burst")) {
    return {
      action: "TEMP_RESTRICT",
      riskLevel: "CRITICAL",
      scopes: ["ALL"],
      durationMs: thresholds.tempRestrictMs,
      reasons: [...reasons, "combo:geo_and_burst"],
      policyVersion,
    };
  }

  if (set.has("otp_burst") || set.has("impossible_geo_jump")) {
    return {
      action: "CHALLENGE",
      riskLevel: "HIGH",
      scopes: set.has("otp_burst") ? ["OTP_REQUEST", "SIGNAL_CREATE"] : ["ALL"],
      durationMs: thresholds.challengeMs,
      reasons,
      policyVersion,
    };
  }

  if (
    set.has("signal_burst") ||
    set.has("high_target_diversity") ||
    set.has("reject_resend_pattern") ||
    (set.has("recent_block_received") && set.has("signal_burst"))
  ) {
    return {
      action: "COOLDOWN",
      riskLevel: "ELEVATED",
      scopes: ["SIGNAL_CREATE"],
      durationMs: thresholds.cooldownMs,
      reasons,
      policyVersion,
    };
  }

  if (set.has("destiny_repetitive")) {
    return {
      action: "COOLDOWN",
      riskLevel: "ELEVATED",
      scopes: ["DESTINY_ACTION"],
      durationMs: thresholds.cooldownMs,
      reasons,
      policyVersion,
    };
  }

  if (set.has("radar_scraping")) {
    return {
      action: "SLOW_DOWN",
      riskLevel: "ELEVATED",
      scopes: ["RADAR_CANDIDATES"],
      durationMs: thresholds.slowDownMs,
      reasons,
      policyVersion,
    };
  }

  if (set.has("recent_block_received")) {
    return {
      action: "REVIEW",
      riskLevel: "ELEVATED",
      scopes: [],
      durationMs: 0,
      reasons: [...reasons, "observe_only"],
      policyVersion,
    };
  }

  return {
    action: "REVIEW",
    riskLevel: "LOW",
    scopes: [],
    durationMs: 0,
    reasons,
    policyVersion,
  };
}

export function scopesBlock(
  scopes: EnforcementScope[],
  check: EnforcementScope,
): boolean {
  if (scopes.includes("ALL")) return true;
  return scopes.includes(check);
}
