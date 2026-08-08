import type { Prisma, PrismaClient } from "@prisma/client";
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
import {
  reviveBlock,
  reviveConnection,
  reviveConsent,
  reviveReport,
  reviveSignal,
  reviveUser,
} from "./revive.js";

type Db = PrismaClient;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Live PostgreSQL protocol repository (S16).
 * Presence writes are no-ops — Redis owns online/TTL.
 */
export class LivePrismaProtocolRepository implements ProtocolRepository {
  readonly name = "prisma";

  constructor(private readonly db: Db) {}

  async upsertUser(user: UserSeed): Promise<void> {
    const payload = asJson(user);
    await this.db.protocolIdentity.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        gender: user.profile.gender,
        interestedIn: user.profile.interestedIn,
        wingmanPlus: Boolean(user.wingmanPlus),
        payload,
      },
      update: {
        gender: user.profile.gender,
        interestedIn: user.profile.interestedIn,
        wingmanPlus: Boolean(user.wingmanPlus),
        payload,
      },
    });
  }

  async saveSignal(signal: SignalRecord): Promise<void> {
    const payload = asJson(signal);
    await this.db.protocolSignalRow.upsert({
      where: { id: signal.id },
      create: {
        id: signal.id,
        pairKey: signal.pairKey,
        isActive: signal.isActive,
        status: signal.status,
        expiresAt: signal.expiresAt,
        payload,
      },
      update: {
        pairKey: signal.pairKey,
        isActive: signal.isActive,
        status: signal.status,
        expiresAt: signal.expiresAt,
        payload,
      },
    });
  }

  async saveConnection(connection: ConnectionRecord): Promise<void> {
    const payload = asJson(connection);
    await this.db.protocolConnectionRow.upsert({
      where: { id: connection.id },
      create: {
        id: connection.id,
        pairKey: connection.pairKey,
        initiatorId: connection.initiatorId,
        recipientId: connection.recipientId,
        state: connection.state,
        isActive: connection.isActive,
        expiresAt: connection.expiresAt,
        payload,
      },
      update: {
        pairKey: connection.pairKey,
        initiatorId: connection.initiatorId,
        recipientId: connection.recipientId,
        state: connection.state,
        isActive: connection.isActive,
        expiresAt: connection.expiresAt,
        payload,
      },
    });
  }

  async saveBlock(block: BlockRecord): Promise<void> {
    const payload = asJson(block);
    await this.db.protocolBlockRow.upsert({
      where: { blockerId_blockedId: { blockerId: block.blockerId, blockedId: block.blockedId } },
      create: {
        id: block.id,
        blockerId: block.blockerId,
        blockedId: block.blockedId,
        payload,
        createdAt: block.createdAt,
      },
      update: { payload },
    });
  }

  async saveReport(report: ReportRecord): Promise<void> {
    await this.db.protocolReportRow.create({
      data: {
        id: report.id,
        payload: asJson(report),
        createdAt: report.createdAt,
      },
    });
  }

  async saveConsent(consent: ConsentRecord): Promise<void> {
    await this.db.protocolConsentRow.create({
      data: {
        id: consent.id,
        userId: consent.userId,
        payload: asJson(consent),
        occurredAt: consent.occurredAt,
      },
    });
  }

  async savePresence(_userId: string, _presence: PresenceRecord, _location?: GeoPoint): Promise<void> {
    // Redis-authoritative — intentionally not durable.
  }

  async saveSignalUsage(usageKey: string, count: number): Promise<void> {
    await this.db.protocolSignalUsageRow.upsert({
      where: { usageKey },
      create: { usageKey, count },
      update: { count },
    });
  }

  async saveAcceptTransition(signal: SignalRecord, connection: ConnectionRecord): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const signalPayload = asJson(signal);
      await tx.protocolSignalRow.upsert({
        where: { id: signal.id },
        create: {
          id: signal.id,
          pairKey: signal.pairKey,
          isActive: signal.isActive,
          status: signal.status,
          expiresAt: signal.expiresAt,
          payload: signalPayload,
        },
        update: {
          pairKey: signal.pairKey,
          isActive: signal.isActive,
          status: signal.status,
          expiresAt: signal.expiresAt,
          payload: signalPayload,
        },
      });
      const connectionPayload = asJson(connection);
      await tx.protocolConnectionRow.upsert({
        where: { id: connection.id },
        create: {
          id: connection.id,
          pairKey: connection.pairKey,
          initiatorId: connection.initiatorId,
          recipientId: connection.recipientId,
          state: connection.state,
          isActive: connection.isActive,
          expiresAt: connection.expiresAt,
          payload: connectionPayload,
        },
        update: {
          pairKey: connection.pairKey,
          initiatorId: connection.initiatorId,
          recipientId: connection.recipientId,
          state: connection.state,
          isActive: connection.isActive,
          expiresAt: connection.expiresAt,
          payload: connectionPayload,
        },
      });
    });
  }

  async getSignal(id: string): Promise<SignalRecord | null> {
    const row = await this.db.protocolSignalRow.findUnique({ where: { id } });
    return row ? reviveSignal(row.payload) : null;
  }

  async getConnection(id: string): Promise<ConnectionRecord | null> {
    const row = await this.db.protocolConnectionRow.findUnique({ where: { id } });
    return row ? reviveConnection(row.payload) : null;
  }

  async listActiveSignals(): Promise<SignalRecord[]> {
    const rows = await this.db.protocolSignalRow.findMany({ where: { isActive: true } });
    return rows.map((r) => reviveSignal(r.payload));
  }

  async listActiveConnections(): Promise<ConnectionRecord[]> {
    const rows = await this.db.protocolConnectionRow.findMany({ where: { isActive: true } });
    return rows.map((r) => reviveConnection(r.payload));
  }

  async loadForHydration(_now: Date): Promise<ProtocolHydrationSnapshot> {
    const [users, signals, connections, blocks, reports, consents, usage] = await Promise.all([
      this.db.protocolIdentity.findMany(),
      this.db.protocolSignalRow.findMany(),
      this.db.protocolConnectionRow.findMany(),
      this.db.protocolBlockRow.findMany(),
      this.db.protocolReportRow.findMany(),
      this.db.protocolConsentRow.findMany(),
      this.db.protocolSignalUsageRow.findMany(),
    ]);
    return {
      users: users.map((u) => reviveUser(u.payload)),
      signals: signals.map((s) => reviveSignal(s.payload)),
      connections: connections.map((c) => reviveConnection(c.payload)),
      blocks: blocks.map((b) => reviveBlock(b.payload)),
      reports: reports.map((r) => reviveReport(r.payload)),
      consents: consents.map((c) => reviveConsent(c.payload)),
      signalUsage: usage.map((u) => ({ usageKey: u.usageKey, count: u.count })),
    };
  }

  async stats() {
    const [users, signals, connections, blocks] = await Promise.all([
      this.db.protocolIdentity.count(),
      this.db.protocolSignalRow.count(),
      this.db.protocolConnectionRow.count(),
      this.db.protocolBlockRow.count(),
    ]);
    return { users, signals, connections, blocks };
  }
}
