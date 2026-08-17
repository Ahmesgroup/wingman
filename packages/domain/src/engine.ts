import type { Clock } from "./clock.js";
import { SystemClock } from "./clock.js";
import {
  applyConnectionEvent,
  createConnectionFromAccept,
  expireConnectionIfNeeded,
  recordMissionOutcome,
  type ConnectionRecord,
} from "./connection/engine.js";
import type { ConnectionEvent } from "./connection/transitions.js";
import {
  emitDestinyPrompt,
  touchCopresence,
  type DestinyCopresence,
} from "./destiny/engine.js";
import { DomainError } from "./errors.js";
import { IdempotencyStore } from "./idempotency.js";
import {
  activatePresence,
  deactivatePresence,
  expirePresenceIfNeeded,
  heartbeat,
  setVisibility,
  type PresenceRecord,
} from "./presence/engine.js";
import {
  ageYearsFromBirthDate,
  buildRadarCandidates,
  protectPrecision,
  type Gender,
  type GeoPoint,
  type InterestTarget,
  type RadarProfile,
} from "./radar/engine.js";
import {
  createBlock,
  createReport,
  filterAntiContact,
  isBlockedEitherWay,
  recordConsent,
  type BlockRecord,
  type ConsentRecord,
  type ReportRecord,
} from "./safety/engine.js";
import {
  blockSignal,
  cancelSignal,
  createSignal,
  expireSignal,
  markSignalAccepted,
  openSignal,
  refuseSignal,
  type SignalRecord,
} from "./signal/engine.js";
import type { AuditRecord, DomainEvent, Entitlements, MissionResponse, PresenceVisibility } from "./types.js";
import { entitlementsFor } from "./types.js";
import { toUtcDayKey } from "./clock.js";

export interface UserSeed {
  id: string;
  profile: RadarProfile;
  wingmanPlus?: boolean;
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * In-memory authoritative engine used by API/tests.
 * Server clock + expiresAt are the source of truth; reapers are reconciler-only.
 */
export class WingmanEngine {
  readonly clock: Clock;
  destinyEnabled: boolean;

  users = new Map<string, UserSeed>();
  presence = new Map<string, PresenceRecord>();
  locations = new Map<string, GeoPoint>();
  signals = new Map<string, SignalRecord>();
  connections = new Map<string, ConnectionRecord>();
  locks = new Set<string>();
  blocks: BlockRecord[] = [];
  reports: ReportRecord[] = [];
  consents: ConsentRecord[] = [];
  destiny = new Map<string, DestinyCopresence>();
  events: DomainEvent[] = [];
  audits: AuditRecord[] = [];
  signalUsage = new Map<string, number>(); // userId|day -> count
  idempotency = new IdempotencyStore();
  missionMessages: Array<{ connectionId: string; senderId: string; text: string; at: Date }> = [];

  /**
   * Optional billing-backed resolver. Must not know Stripe — only return Entitlements.
   * Falls back to UserSeed.wingmanPlus when unset.
   */
  private entitlementsForUser?: (userId: string, now: Date) => Entitlements;

  constructor(opts?: {
    clock?: Clock;
    destinyEnabled?: boolean;
    entitlementsForUser?: (userId: string, now: Date) => Entitlements;
  }) {
    this.clock = opts?.clock ?? new SystemClock();
    this.destinyEnabled = opts?.destinyEnabled ?? false;
    this.entitlementsForUser = opts?.entitlementsForUser;
  }

  /** Wire billing EntitlementService after construction (Nest DI). */
  setEntitlementsForUser(fn: (userId: string, now: Date) => Entitlements): void {
    this.entitlementsForUser = fn;
  }

  seedUser(user: UserSeed): void {
    this.users.set(user.id, user);
  }

  /**
   * Persist onboarding / settings profile for a known identity.
   * Radar eligibility uses gender + interestedIn; extras stay opaque to candidates.
   */
  updateProfile(
    userId: string,
    patch: {
      gender: Gender;
      interestedIn: InterestTarget[];
      firstName?: string;
      birthDate?: string;
      heightCm?: number;
      dailyBio?: string;
      interests?: string[];
      mood?: string;
      intention?: string;
    },
  ): UserSeed {
    const user = this.users.get(userId);
    if (!user) throw new DomainError("NOT_FOUND", "User not found");
    if (!patch.interestedIn.length) {
      throw new DomainError("VALIDATION_REQUIRED", "interestedIn required");
    }
    if (patch.birthDate) {
      const age = ageYearsFromBirthDate(patch.birthDate, this.clock.now());
      if (!Number.isFinite(age) || age < 18) {
        throw new DomainError("VALIDATION_REQUIRED", "Must be 18+", { age });
      }
    }
    if (patch.interests && patch.interests.length > 5) {
      throw new DomainError("VALIDATION_REQUIRED", "Max 5 interests");
    }
    if (patch.heightCm != null && (patch.heightCm < 120 || patch.heightCm > 230)) {
      throw new DomainError("VALIDATION_REQUIRED", "heightCm out of range");
    }
    if (patch.dailyBio != null && patch.dailyBio.length > 150) {
      throw new DomainError("VALIDATION_REQUIRED", "dailyBio too long");
    }
    const profile = {
      ...user.profile,
      userId,
      gender: patch.gender,
      interestedIn: [...patch.interestedIn],
      firstName: patch.firstName?.trim() || undefined,
      birthDate: patch.birthDate,
      heightCm: patch.heightCm,
      dailyBio: patch.dailyBio?.trim() || undefined,
      interests: patch.interests ? [...patch.interests] : undefined,
      mood: patch.mood ?? user.profile.mood,
      intention: patch.intention ?? user.profile.intention,
    };
    const next = { ...user, profile };
    this.users.set(userId, next);
    this.audit("profile.update", userId);
    return next;
  }

  /** Sync seed flag after billing changes (never accept client isPremium). */
  setWingmanPlus(userId: string, wingmanPlus: boolean): void {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.set(userId, { ...user, wingmanPlus });
  }

  entitlements(userId: string): Entitlements {
    if (this.entitlementsForUser) {
      return this.entitlementsForUser(userId, this.clock.now());
    }
    return entitlementsFor(Boolean(this.users.get(userId)?.wingmanPlus));
  }

  private emit(events: DomainEvent[]): void {
    this.events.push(...events);
  }

  private audit(action: string, actorId?: string, subjectId?: string, meta?: Record<string, unknown>): void {
    this.audits.push({ action, actorId, subjectId, at: this.clock.now(), meta });
  }

  private usageKey(userId: string): string {
    return `${userId}|${toUtcDayKey(this.clock.now())}`;
  }

  private signalsUsedToday(userId: string): number {
    return this.signalUsage.get(this.usageKey(userId)) ?? 0;
  }

  private incrementSignalUsage(userId: string): void {
    const k = this.usageKey(userId);
    this.signalUsage.set(k, (this.signalUsage.get(k) ?? 0) + 1);
  }

  private activePairSignal(pair: string): boolean {
    for (const s of this.signals.values()) {
      if (s.pairKey === pair && s.isActive) return true;
    }
    return false;
  }

  // ---- Presence ----
  activateRadar(userId: string, location: GeoPoint, visibility: PresenceVisibility = "ACTIVE"): PresenceRecord {
    const p = activatePresence(userId, visibility, this.clock);
    this.presence.set(userId, p);
    this.locations.set(userId, protectPrecision(location));
    this.audit("presence.activate", userId);
    return p;
  }

  heartbeat(userId: string, location?: GeoPoint): PresenceRecord {
    const existing = this.presence.get(userId);
    if (!existing?.online) throw new DomainError("NOT_FOUND", "Presence not active");
    const p = heartbeat(existing, this.clock);
    this.presence.set(userId, p);
    if (location) this.locations.set(userId, protectPrecision(location));
    return p;
  }

  setPresenceVisibility(userId: string, visibility: PresenceVisibility): PresenceRecord {
    const existing = this.presence.get(userId);
    if (!existing?.online) throw new DomainError("NOT_FOUND", "Presence not active");
    const p = setVisibility(existing, visibility, this.clock);
    this.presence.set(userId, p);
    return p;
  }

  deactivateRadar(userId: string): PresenceRecord {
    const existing = this.presence.get(userId);
    if (!existing) throw new DomainError("NOT_FOUND", "Presence not found");
    const p = deactivatePresence(existing, this.clock);
    this.presence.set(userId, p);
    this.audit("presence.deactivate", userId);
    return p;
  }

  reapPresence(): string[] {
    const ghosts: string[] = [];
    for (const [userId, p] of this.presence) {
      const expired = expirePresenceIfNeeded(p, this.clock);
      if (expired) {
        this.presence.set(userId, expired);
        ghosts.push(userId);
      }
    }
    return ghosts;
  }

  // ---- Radar ----
  getCandidates(viewerId: string, nearRadiusM = 50, aroundRadiusM = 200) {
    const viewer = this.users.get(viewerId);
    const loc = this.locations.get(viewerId);
    const viewerPresence = this.presence.get(viewerId);
    if (!viewer || !loc || !viewerPresence?.online || this.clock.now().getTime() >= viewerPresence.expiresAt.getTime()) {
      throw new DomainError("NOT_FOUND", "Viewer not on radar");
    }
    const blocked = new Set<string>();
    for (const b of this.blocks) {
      if (b.blockerId === viewerId) blocked.add(b.blockedId);
      if (b.blockedId === viewerId) blocked.add(b.blockerId);
    }
    const others = [];
    for (const u of this.users.values()) {
      if (u.id === viewerId) continue;
      const presence = this.presence.get(u.id);
      const location = this.locations.get(u.id);
      if (!presence || !location) continue;
      others.push({ profile: u.profile, location, presence });
    }
    return buildRadarCandidates(
      {
        viewerId,
        viewer: viewer.profile,
        viewerLocation: loc,
        nearRadiusM,
        aroundRadiusM,
        blockedUserIds: blocked,
      },
      others,
      this.clock,
    );
  }

  // ---- Signals ----
  sendSignal(senderId: string, receiverId: string, idempotencyKey?: string, source: "RADAR" | "DESTINY" | "REMATCH" = "RADAR") {
    if (idempotencyKey) {
      const began = this.idempotency.begin(senderId, "POST /signals", idempotencyKey, this.clock.now());
      if ("replay" in began) return began.replay as SignalRecord;
    }
    const pk = [senderId, receiverId].sort().join(":");
    const { signal, events } = createSignal(
      {
        id: newId("sig"),
        senderId,
        receiverId,
        source,
        entitlements: this.entitlements(senderId),
        signalsUsedToday: this.signalsUsedToday(senderId),
        hasActivePairSignal: this.activePairSignal(pk),
        isBlockedEitherWay: isBlockedEitherWay(this.blocks, senderId, receiverId),
        senderLocked: this.locks.has(senderId),
        receiverLocked: this.locks.has(receiverId),
      },
      this.clock,
    );
    this.signals.set(signal.id, signal);
    this.incrementSignalUsage(senderId);
    this.emit(events);
    this.audit("signal.create", senderId, receiverId, { signalId: signal.id });
    if (idempotencyKey) this.idempotency.complete(senderId, "POST /signals", idempotencyKey, signal);
    return signal;
  }

  openSignal(signalId: string, actorId: string): SignalRecord {
    const s = this.requireSignal(signalId);
    const next = openSignal(s, actorId, this.clock);
    this.signals.set(signalId, next);
    return next;
  }

  refuseSignal(signalId: string, actorId: string): SignalRecord {
    const s = this.requireSignal(signalId);
    const { signal, events } = refuseSignal(s, actorId, this.clock);
    this.signals.set(signalId, signal);
    this.emit(events);
    return signal;
  }

  cancelSignal(signalId: string, actorId: string): SignalRecord {
    const s = this.requireSignal(signalId);
    const { signal, events } = cancelSignal(s, actorId, this.clock);
    this.signals.set(signalId, signal);
    this.emit(events);
    return signal;
  }

  acceptSignal(signalId: string, actorId: string): ConnectionRecord {
    const s = this.requireSignal(signalId);
    if (isBlockedEitherWay(this.blocks, s.senderId, s.receiverId)) {
      const blocked = blockSignal(s, this.clock);
      this.signals.set(signalId, blocked.signal);
      this.emit(blocked.events);
      throw new DomainError("SIGNAL_BLOCKED", "Cannot accept blocked pair");
    }
    if (this.locks.has(s.senderId) || this.locks.has(s.receiverId)) {
      throw new DomainError("USER_LOCKED", "User locked");
    }
    const accepted = markSignalAccepted(s, actorId, this.clock);
    this.signals.set(signalId, accepted);
    const { connection, events } = createConnectionFromAccept(
      {
        id: newId("conn"),
        initiatorId: accepted.senderId,
        recipientId: accepted.receiverId,
        entitlements: this.entitlements(accepted.senderId),
      },
      this.clock,
    );
    this.connections.set(connection.id, connection);
    this.locks.add(connection.initiatorId);
    this.locks.add(connection.recipientId);
    this.emit(events);
    this.audit("signal.accept", actorId, connection.id);
    // Mission mode: hide both from radar
    for (const uid of [connection.initiatorId, connection.recipientId]) {
      const p = this.presence.get(uid);
      if (p?.online) this.presence.set(uid, setVisibility(p, "MISSION", this.clock));
    }
    return connection;
  }

  private requireSignal(id: string): SignalRecord {
    const s = this.signals.get(id);
    if (!s) throw new DomainError("SIGNAL_NOT_FOUND", "Signal not found");
    return s;
  }

  reapSignals(): string[] {
    const expired: string[] = [];
    for (const [id, s] of this.signals) {
      const res = expireSignal(s, this.clock);
      if (res) {
        this.signals.set(id, res.signal);
        this.emit(res.events);
        expired.push(id);
      }
    }
    return expired;
  }

  // ---- Connection / validation / mission ----
  applyConnection(connectionId: string, event: ConnectionEvent, actorId: string, extra?: { mediaId?: string; outcome?: MissionResponse }) {
    const c = this.requireConnection(connectionId);
    if (isBlockedEitherWay(this.blocks, c.initiatorId, c.recipientId) && event !== "block") {
      throw new DomainError("BLOCKED_PAIR", "Blocked");
    }
    const result = applyConnectionEvent(c, event, this.clock, {
      entitlements: this.entitlements(c.initiatorId),
      actorId,
      mediaId: extra?.mediaId,
      outcome: extra?.outcome,
    });
    this.connections.set(connectionId, result.connection);
    this.emit(result.events);
    if (result.releaseLocks) {
      this.locks.delete(c.initiatorId);
      this.locks.delete(c.recipientId);
      this.restorePresenceAfterProtocol(c.initiatorId);
      this.restorePresenceAfterProtocol(c.recipientId);
    }
    if (result.connection.state === "COOLDOWN_ACTIVE") {
      for (const uid of [c.initiatorId, c.recipientId]) {
        const p = this.presence.get(uid);
        if (p?.online) this.presence.set(uid, setVisibility(p, "COOLDOWN", this.clock));
      }
    }
    return result.connection;
  }

  recordOutcome(connectionId: string, actorId: string, outcome: MissionResponse) {
    const c = this.requireConnection(connectionId);
    const result = recordMissionOutcome(c, actorId, outcome, this.clock, this.entitlements(c.initiatorId));
    this.connections.set(connectionId, result.connection);
    this.emit(result.events);
    if (result.connection.state === "COOLDOWN_ACTIVE") {
      for (const uid of [c.initiatorId, c.recipientId]) {
        const p = this.presence.get(uid);
        if (p?.online) this.presence.set(uid, setVisibility(p, "COOLDOWN", this.clock));
      }
    }
    return result.connection;
  }

  postMissionMessage(connectionId: string, senderId: string, text: string) {
    const c = this.requireConnection(connectionId);
    if (c.state !== "MISSION_MEET_ACTIVE" && c.state !== "MISSION_CONFIRMED") {
      throw new DomainError("FORBIDDEN_TRANSITION", "Mission chat not active");
    }
    const filtered = filterAntiContact(text);
    if (filtered.blocked) {
      this.audit("mission.anti_contact", senderId, connectionId);
    }
    const msg = { connectionId, senderId, text: filtered.text, at: this.clock.now() };
    this.missionMessages.push(msg);
    return { ...msg, filtered: filtered.blocked };
  }

  private restorePresenceAfterProtocol(userId: string): void {
    const p = this.presence.get(userId);
    if (p?.online) this.presence.set(userId, setVisibility(p, "ACTIVE", this.clock));
  }

  private requireConnection(id: string): ConnectionRecord {
    const c = this.connections.get(id);
    if (!c) throw new DomainError("CONNECTION_NOT_FOUND", "Connection not found");
    return c;
  }

  reapConnections(): string[] {
    const changed: string[] = [];
    for (const [id, c] of this.connections) {
      const res = expireConnectionIfNeeded(c, this.clock, this.entitlements(c.initiatorId));
      if (res) {
        this.connections.set(id, res.connection);
        this.emit(res.events);
        if (res.releaseLocks) {
          this.locks.delete(c.initiatorId);
          this.locks.delete(c.recipientId);
          this.restorePresenceAfterProtocol(c.initiatorId);
          this.restorePresenceAfterProtocol(c.recipientId);
        }
        if (res.connection.state === "COOLDOWN_ACTIVE") {
          for (const uid of [c.initiatorId, c.recipientId]) {
            const p = this.presence.get(uid);
            if (p?.online) this.presence.set(uid, setVisibility(p, "COOLDOWN", this.clock));
          }
        }
        changed.push(id);
      }
    }
    return changed;
  }

  /** Reconcile all expirations (presence, signals, connections). */
  reconcile(): { presence: string[]; signals: string[]; connections: string[] } {
    return {
      presence: this.reapPresence(),
      signals: this.reapSignals(),
      connections: this.reapConnections(),
    };
  }

  // ---- Safety ----
  blockUser(blockerId: string, blockedId: string): BlockRecord {
    const block = createBlock(newId("blk"), blockerId, blockedId, this.clock);
    this.blocks.push(block);
    // close active signals
    for (const [id, s] of this.signals) {
      if (
        s.isActive &&
        ((s.senderId === blockerId && s.receiverId === blockedId) ||
          (s.senderId === blockedId && s.receiverId === blockerId))
      ) {
        const res = blockSignal(s, this.clock);
        this.signals.set(id, res.signal);
        this.emit(res.events);
      }
    }
    // block active connection
    for (const [id, c] of this.connections) {
      if (
        c.isActive &&
        ((c.initiatorId === blockerId && c.recipientId === blockedId) ||
          (c.initiatorId === blockedId && c.recipientId === blockerId))
      ) {
        this.applyConnection(id, "block", blockerId);
      }
    }
    this.audit("safety.block", blockerId, blockedId);
    return block;
  }

  reportUser(reporterId: string, reportedId: string, category: string, connectionId?: string): ReportRecord {
    const report = createReport(newId("rpt"), reporterId, reportedId, category, this.clock, connectionId);
    this.reports.push(report);
    this.audit("safety.report", reporterId, reportedId, { category });
    return report;
  }

  grantConsent(userId: string, purpose: string, policyVersion: string): ConsentRecord {
    const c = recordConsent(newId("cns"), userId, purpose, "GRANTED", policyVersion, this.clock);
    this.consents.push(c);
    return c;
  }

  // ---- Destiny ----
  noteCopresence(userA: string, userB: string): DestinyCopresence {
    const key = [userA, userB].sort().join(":");
    const next = touchCopresence(this.destiny.get(key), userA, userB, this.clock);
    this.destiny.set(key, next);
    return next;
  }

  tryDestinyPrompt(userA: string, userB: string): boolean {
    const key = [userA, userB].sort().join(":");
    const existing = this.destiny.get(key);
    if (!existing) return false;
    const both =
      this.consents.some((c) => c.userId === userA && c.purpose === "DESTINY_CONNECTION" && c.action === "GRANTED") &&
      this.consents.some((c) => c.userId === userB && c.purpose === "DESTINY_CONNECTION" && c.action === "GRANTED");
    const { copresence, emit } = emitDestinyPrompt(existing, this.destinyEnabled, both, this.clock);
    this.destiny.set(key, copresence);
    if (emit) {
      this.emit([{ type: "destiny.prompt", at: this.clock.now(), payload: { pairKey: key }, notify: true }]);
    }
    return emit;
  }
}
