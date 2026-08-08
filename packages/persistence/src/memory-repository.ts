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
import type { ProtocolHydrationSnapshot, ProtocolRepository } from "./protocol-repository.js";

/** In-process durable mirror used in tests and single-node defaults. */
export class MemoryProtocolRepository implements ProtocolRepository {
  readonly name = "memory";
  users = new Map<string, UserSeed>();
  signals = new Map<string, SignalRecord>();
  connections = new Map<string, ConnectionRecord>();
  blocks: BlockRecord[] = [];
  reports: ReportRecord[] = [];
  consents: ConsentRecord[] = [];
  /** Advisory only — never returned by loadForHydration. */
  presence = new Map<string, { presence: PresenceRecord; location?: GeoPoint }>();
  signalUsage = new Map<string, number>();

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
    const idx = this.blocks.findIndex(
      (b) => b.blockerId === block.blockerId && b.blockedId === block.blockedId,
    );
    if (idx >= 0) this.blocks[idx] = structuredClone(block);
    else this.blocks.push(structuredClone(block));
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

  async saveSignalUsage(usageKey: string, count: number): Promise<void> {
    this.signalUsage.set(usageKey, count);
  }

  async saveAcceptTransition(signal: SignalRecord, connection: ConnectionRecord): Promise<void> {
    await this.saveSignal(signal);
    await this.saveConnection(connection);
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

  async loadForHydration(_now: Date): Promise<ProtocolHydrationSnapshot> {
    return {
      users: [...this.users.values()].map((u) => structuredClone(u)),
      signals: [...this.signals.values()].map((s) => structuredClone(s)),
      connections: [...this.connections.values()].map((c) => structuredClone(c)),
      blocks: this.blocks.map((b) => structuredClone(b)),
      reports: this.reports.map((r) => structuredClone(r)),
      consents: this.consents.map((c) => structuredClone(c)),
      signalUsage: [...this.signalUsage.entries()].map(([usageKey, count]) => ({ usageKey, count })),
    };
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
