import type {
  BlockRecord,
  ConsentRecord,
  ConnectionRecord,
  PresenceRecord,
  ReportRecord,
  SignalRecord,
  UserSeed,
} from "@wingman/domain";
import type { GeoPoint } from "@wingman/domain";

/**
 * Durable write-behind for protocol artifacts.
 * Domain remains the transition authority; this store never decides state machines.
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
  getSignal(id: string): Promise<SignalRecord | null>;
  getConnection(id: string): Promise<ConnectionRecord | null>;
  listActiveSignals(): Promise<SignalRecord[]>;
  listActiveConnections(): Promise<ConnectionRecord[]>;
  stats(): Promise<{ users: number; signals: number; connections: number; blocks: number }>;
}
