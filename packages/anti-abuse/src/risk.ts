import type { AbuseEvent, PolicyThresholds, RiskSignalName } from "./types.js";
import { DEFAULT_POLICY_THRESHOLDS } from "./types.js";

function inWindow(events: AbuseEvent[], kind: AbuseEvent["kind"], sinceMs: number): AbuseEvent[] {
  return events.filter((e) => e.kind === kind && e.at.getTime() >= sinceMs);
}

/**
 * Derive named risk signals from a behavioral window.
 * Expired / out-of-window events are ignored by the caller (listEvents already filters).
 */
export function deriveRiskSignals(
  events: AbuseEvent[],
  now: Date,
  thresholds: PolicyThresholds = DEFAULT_POLICY_THRESHOLDS,
): RiskSignalName[] {
  const signals: RiskSignalName[] = [];
  const nowMs = now.getTime();

  const sent = inWindow(events, "signal.sent", nowMs - thresholds.signalBurstWindowMs);
  if (sent.length >= thresholds.signalBurstCount) {
    signals.push("signal_burst");
  }

  const diversityWindow = events.filter(
    (e) =>
      e.kind === "signal.sent" &&
      e.at.getTime() >= nowMs - thresholds.targetDiversityWindowMs &&
      e.subjectId,
  );
  const targets = new Set(diversityWindow.map((e) => e.subjectId!));
  if (targets.size >= thresholds.targetDiversityCount) {
    signals.push("high_target_diversity");
  }

  // reject → resend: a refuse_by_target for pair, then signal.sent to same subject
  const refuses = events.filter((e) => e.kind === "signal.refused_by_target");
  for (const r of refuses) {
    if (!r.subjectId) continue;
    const resent = events.some(
      (e) =>
        e.kind === "signal.sent" &&
        e.subjectId === r.subjectId &&
        e.at.getTime() > r.at.getTime() &&
        e.at.getTime() - r.at.getTime() <= thresholds.rejectResendWindowMs,
    );
    if (resent) {
      signals.push("reject_resend_pattern");
      break;
    }
  }

  const blocks = inWindow(events, "safety.block_received", nowMs - thresholds.blockReceivedWindowMs);
  if (blocks.length >= 1) {
    signals.push("recent_block_received");
  }

  const radar = inWindow(events, "radar.candidates", nowMs - thresholds.radarScrapeWindowMs);
  if (radar.length >= thresholds.radarScrapeCount) {
    signals.push("radar_scraping");
  }

  const destiny = events.filter(
    (e) =>
      (e.kind === "destiny.copresence" || e.kind === "destiny.accept" || e.kind === "destiny.decline") &&
      e.at.getTime() >= nowMs - thresholds.destinyRepetitiveWindowMs,
  );
  if (destiny.length >= thresholds.destinyRepetitiveCount) {
    signals.push("destiny_repetitive");
  }

  const otp = inWindow(events, "auth.otp_request", nowMs - thresholds.otpBurstWindowMs);
  if (otp.length >= thresholds.otpBurstCount) {
    signals.push("otp_burst");
  }

  const geos = events
    .filter((e) => e.kind === "geo.heartbeat" && typeof e.meta?.approxDistanceDeltaM === "number")
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  for (let i = 1; i < geos.length; i++) {
    const prev = geos[i - 1]!;
    const cur = geos[i]!;
    const dt = cur.at.getTime() - prev.at.getTime();
    const dist = Number(cur.meta!.approxDistanceDeltaM);
    if (dt > 0 && dt <= thresholds.impossibleGeoJumpMaxMs && dist >= thresholds.impossibleGeoJumpMeters) {
      signals.push("impossible_geo_jump");
      break;
    }
  }

  return signals;
}
