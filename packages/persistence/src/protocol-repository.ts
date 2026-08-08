import type {
  BlockRecord,
  ConsentRecord,
  ConnectionRecord,
  PresenceRecord,
  ReportRecord,
  SignalRecord,
  UserSeed,
  GeoPoint,
} from "@wingman/domain";

/**
 * Durable write-behind for protocol artifacts.
 * Domain remains the transition authority; this store never decides state machines.
 *
 * Presence may be accepted for advisory mirrors but MUST NOT be used for boot hydrate
 * (Redis is authoritative for online/TTL).
 */
export interface ProtocolRepository {
  readonly name: string;
  upsertUser(user: UserSeed): Promise<void>;
  saveSignal(signal: SignalRecord): Promise<void>;
  saveConnection(connection: ConnectionRecord): Promise<void>;
  saveBlock(block: BlockRecord): Promise<void>;
  saveReport(report: ReportRecord): Promise<void>;
  saveConsent(consent: ConsentRecord): Promise<void>;
  savePresence(userId: string, presence: PresenceRecord, location?: GeoPoint): Promise<void>;
  saveSignalUsage(usageKey: string, count: number): Promise<void>;
  /** Atomic signal+connection write (accept path). */
  saveAcceptTransition(signal: SignalRecord, connection: ConnectionRecord): Promise<void>;
  getSignal(id: string): Promise<SignalRecord | null>;
  getConnection(id: string): Promise<ConnectionRecord | null>;
  listActiveSignals(): Promise<SignalRecord[]>;
  listActiveConnections(): Promise<ConnectionRecord[]>;
  loadForHydration(now: Date): Promise<ProtocolHydrationSnapshot>;
  stats(): Promise<{ users: number; signals: number; connections: number; blocks: number }>;
}

/** Durable slice loaded at boot — never includes live presence/locations. */
export interface ProtocolHydrationSnapshot {
  users: UserSeed[];
  signals: SignalRecord[];
  connections: ConnectionRecord[];
  blocks: BlockRecord[];
  reports: ReportRecord[];
  consents: ConsentRecord[];
  signalUsage: Array<{ usageKey: string; count: number }>;
}
