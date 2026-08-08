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
import type { ProtocolRepository } from "./protocol-repository.js";

/** In-process durable mirror used in tests and single-node defaults. */
export class MemoryProtocolRepository implements ProtocolRepository {
  readonly name = "memory";
  users = new Map<string, UserSeed>();
  signals = new Map<string, SignalRecord>();
  connections = new Map<string, ConnectionRecord>();
  blocks: BlockRecord[] = [];
  reports: ReportRecord[] = [];
  consents: ConsentRecord[] = [];
  presence = new Map<string, { presence: PresenceRecord; location?: GeoPoint }>();

  async upsertUser(user: UserSeed): Promise<void> {
    this.users.set(user.id, structuredClone(user));
  }

  async saveSignal(signal: SignalRecord): Promise<void> {
    this.signals.set(signal.id, structuredClone(signal));
  }

  async saveConnection(connection: ConnectionRecord): Promise<void> {
    this.connections.set(connection.id, structuredClone(connection));
  }

  async saveBlock(block: BlockRecord): Promise<void> {
    this.blocks.push(structuredClone(block));
  }

  async saveReport(report: ReportRecord): Promise<void> {
    this.reports.push(structuredClone(report));
  }

  async saveConsent(consent: ConsentRecord): Promise<void> {
    this.consents.push(structuredClone(consent));
  }

  async savePresence(userId: string, presence: PresenceRecord, location?: GeoPoint): Promise<void> {
    this.presence.set(userId, {
      presence: structuredClone(presence),
      location: location ? { ...location } : undefined,
    });
  }

  async getSignal(id: string): Promise<SignalRecord | null> {
    return this.signals.get(id) ?? null;
  }

  async getConnection(id: string): Promise<ConnectionRecord | null> {
    return this.connections.get(id) ?? null;
  }

  async listActiveSignals(): Promise<SignalRecord[]> {
    return [...this.signals.values()].filter((s) => s.isActive);
  }

  async listActiveConnections(): Promise<ConnectionRecord[]> {
    return [...this.connections.values()].filter((c) => c.isActive);
  }

  async stats() {
    return {
      users: this.users.size,
      signals: this.signals.size,
      connections: this.connections.size,
      blocks: this.blocks.length,
    };
  }
}
