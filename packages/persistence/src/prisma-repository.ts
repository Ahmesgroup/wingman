import type {
  BlockRecord,
  ConsentRecord,
  ConnectionRecord,
  GeoPoint,
  PresenceRecord,
  ReportRecord,
  SignalRecord,
  UserSeed,
} from "@wingman/domain";
import type { ProtocolRepository } from "./protocol-repository.js";

/**
 * Minimal Prisma-shaped surface used by the write-behind adapter.
 * Keeps @wingman/persistence free of a hard PrismaClient runtime dependency in tests.
 */
export interface ProtocolPrismaClient {
  signal: {
    upsert(args: {
      where: { id: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
    findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
    findMany(args: { where: { isActive: boolean } }): Promise<Record<string, unknown>[]>;
  };
  connection: {
    upsert(args: {
      where: { id: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
    findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
    findMany(args: { where: { isActive: boolean } }): Promise<Record<string, unknown>[]>;
  };
  userBlock: {
    upsert(args: {
      where: { blockerId_blockedId: { blockerId: string; blockedId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
  report: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  consentEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/**
 * PostgreSQL write-behind via Prisma delegates.
 * Domain remains transition authority; this never decides state machines.
 *
 * Note: User rows in the full V4.1 schema require phone crypto fields.
 * UserSeed mirroring is therefore a no-op here — seed users through your
 * identity pipeline, then mirror protocol artifacts (signals/connections/…).
 */
export class PrismaProtocolRepository implements ProtocolRepository {
  readonly name = "prisma";
  private users = 0;
  private blocks = 0;
  private reports = 0;
  private signals = 0;
  private connections = 0;
  private presence = new Map<string, { presence: PresenceRecord; location?: GeoPoint }>();

  constructor(private readonly db: ProtocolPrismaClient) {}

  async upsertUser(_user: UserSeed): Promise<void> {
    // Intentionally skipped — full User model needs phone ciphertext / hash.
    this.users += 1;
  }

  async saveSignal(signal: SignalRecord): Promise<void> {
    const data = {
      id: signal.id,
      pairKey: signal.pairKey,
      senderId: signal.senderId,
      receiverId: signal.receiverId,
      source: signal.source,
      status: signal.status,
      isActive: signal.isActive,
      createdAt: signal.createdAt,
      openedAt: signal.openedAt ?? null,
      acceptedAt: signal.acceptedAt ?? null,
      expiresAt: signal.expiresAt,
      closedAt: signal.closedAt ?? null,
    };
    await this.db.signal.upsert({
      where: { id: signal.id },
      create: data,
      update: data,
    });
    this.signals += 1;
  }

  async saveConnection(connection: ConnectionRecord): Promise<void> {
    const data = {
      id: connection.id,
      initiatorId: connection.initiatorId,
      recipientId: connection.recipientId,
      pairLowId: connection.pairLowId,
      pairHighId: connection.pairHighId,
      pairKey: connection.pairKey,
      state: connection.state,
      isActive: connection.isActive,
      startedAt: connection.startedAt,
      expiresAt: connection.expiresAt,
      endedAt: connection.endedAt ?? null,
      failureReason: connection.failureReason ?? null,
      purgeAt: connection.purgeAt ?? new Date(connection.expiresAt.getTime() + 30 * 86400_000),
    };
    await this.db.connection.upsert({
      where: { id: connection.id },
      create: data,
      update: data,
    });
    this.connections += 1;
  }

  async saveBlock(block: BlockRecord): Promise<void> {
    await this.db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: block.blockerId, blockedId: block.blockedId } },
      create: {
        id: block.id,
        blockerId: block.blockerId,
        blockedId: block.blockedId,
        createdAt: block.createdAt,
      },
      update: {},
    });
    this.blocks += 1;
  }

  async saveReport(report: ReportRecord): Promise<void> {
    await this.db.report.create({
      data: {
        id: report.id,
        reporterId: report.reporterId,
        reportedId: report.reportedId,
        category: report.category,
        connectionId: report.connectionId ?? null,
        createdAt: report.createdAt,
      },
    });
    this.reports += 1;
  }

  async saveConsent(consent: ConsentRecord): Promise<void> {
    await this.db.consentEvent.create({
      data: {
        id: consent.id,
        userId: consent.userId,
        purpose: consent.purpose,
        action: consent.action,
        policyVersion: consent.policyVersion,
        occurredAt: consent.occurredAt,
        source: "SETTINGS",
      },
    });
  }

  async savePresence(userId: string, presence: PresenceRecord, location?: GeoPoint): Promise<void> {
    // Presence remains Redis-authoritative; this keeps an advisory last-known snapshot in-process.
    this.presence.set(userId, {
      presence: structuredClone(presence),
      location: location ? { ...location } : undefined,
    });
  }

  async getSignal(id: string): Promise<SignalRecord | null> {
    const row = await this.db.signal.findUnique({ where: { id } });
    return row ? (row as unknown as SignalRecord) : null;
  }

  async getConnection(id: string): Promise<ConnectionRecord | null> {
    const row = await this.db.connection.findUnique({ where: { id } });
    return row ? (row as unknown as ConnectionRecord) : null;
  }

  async listActiveSignals(): Promise<SignalRecord[]> {
    const rows = await this.db.signal.findMany({ where: { isActive: true } });
    return rows as unknown as SignalRecord[];
  }

  async listActiveConnections(): Promise<ConnectionRecord[]> {
    const rows = await this.db.connection.findMany({ where: { isActive: true } });
    return rows as unknown as ConnectionRecord[];
  }

  async stats() {
    return {
      users: this.users,
      signals: this.signals,
      connections: this.connections,
      blocks: this.blocks,
    };
  }
}
