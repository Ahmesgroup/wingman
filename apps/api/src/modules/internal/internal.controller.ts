import { Controller, Get, Inject, Injectable, Optional, Post, Query } from "@nestjs/common";
import type { EphemeralStore } from "@wingman/ephemeral";
import type { WingmanEngine } from "@wingman/domain";
import type { MetricsRegistry } from "@wingman/observability";
import { buildReadiness } from "@wingman/observability";
import type { PrismaClient } from "@wingman/database";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { METRICS } from "../../common/observability.interceptor.js";
import { Public } from "../../common/public.decorator.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import type { NotificationOrchestrator } from "@wingman/notifications";
import { EPHEMERAL_STORE, MEDIA_STORE, NOTIFICATION_ORCH, PRISMA_CLIENT, PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "../realtime/realtime-app.service.js";
import { MeasurementGate } from "../measurement/measurement.module.js";
import type { MediaStore } from "@wingman/media";

@Injectable()
export class InternalService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(METRICS) private readonly metricsRegistry: MetricsRegistry,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient | null,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly realtime: RealtimeAppService,
    @Inject(NOTIFICATION_ORCH) private readonly notifications: NotificationOrchestrator,
    @Optional() private readonly measurement?: MeasurementGate,
  ) {}

  async reconcile() {
    const result = this.engine.reconcile();
    await this.mirror.mirrorAll();
    for (const id of result.connections) {
      const c = this.engine.connections.get(id);
      if (!c) continue;
      if (c.state === "EXPIRED" || c.state === "OUTCOME_PENDING") {
        await this.realtime.publish({
          type: c.state === "EXPIRED" ? "mission.expired" : "mission.updated",
          aggregateId: id,
          rooms: [
            this.realtime.userRoom(c.initiatorId),
            this.realtime.userRoom(c.recipientId),
            this.realtime.connectionRoom(id),
            this.realtime.missionRoom(id),
          ],
          payload: { connectionId: id, state: c.state },
        });
        if (c.state === "EXPIRED") {
          for (const uid of [c.initiatorId, c.recipientId]) {
            this.notifications.handleAppEvent({
              type: "mission.expired",
              userId: uid,
              aggregateId: id,
              payload: { connectionId: id, state: c.state },
            });
          }
          void this.notifications.processQueue().catch(() => {});
        }
      }
      if (["EXPIRED", "CANCELLED", "BLOCKED", "COMPLETED", "FAILED"].includes(c.state)) {
        try {
          await this.media.deleteByConnection(id);
        } catch {
          /* best-effort purge */
        }
        await this.realtime.publish({
          type: "connection.closed",
          aggregateId: id,
          rooms: [
            this.realtime.userRoom(c.initiatorId),
            this.realtime.userRoom(c.recipientId),
            this.realtime.connectionRoom(id),
          ],
          payload: { connectionId: id, state: c.state },
        });
      }
    }
    try {
      await this.media.purgeExpired(this.engine.clock.now());
    } catch {
      /* best-effort TTL sweep */
    }
    return result;
  }

  async metrics() {
    const persisted = await this.mirror.repository.stats();
    return {
      users: this.engine.users.size,
      online: [...this.engine.presence.values()].filter((p) => p.online).length,
      activeSignals: [...this.engine.signals.values()].filter((s) => s.isActive).length,
      activeConnections: [...this.engine.connections.values()].filter((c) => c.isActive).length,
      locks: this.engine.locks.size,
      events: this.engine.events.length,
      audits: this.engine.audits.length,
      destinyEnabled: this.engine.destinyEnabled,
      persistence: { name: this.mirror.repository.name, ...persisted },
      http: this.metricsRegistry.snapshot(),
    };
  }

  async readiness() {
    let redisOk = true;
    let redisDetail = "memory-ephemeral";
    try {
      await this.ephemeral.incrQuota("readiness-probe", 5);
      redisDetail = process.env.REDIS_URL ? "redis" : "memory-ephemeral";
    } catch (e) {
      redisOk = false;
      redisDetail = e instanceof Error ? e.message : "ephemeral failure";
    }
    let persistenceOk = true;
    let persistenceDetail = this.mirror.repository.name;
    try {
      await this.mirror.repository.stats();
    } catch (e) {
      persistenceOk = false;
      persistenceDetail = e instanceof Error ? e.message : "persistence failure";
    }
    let databaseOk = true;
    let databaseDetail = "not-configured";
    if (this.prisma) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        databaseDetail = "postgres";
      } catch (e) {
        databaseOk = false;
        databaseDetail = e instanceof Error ? e.message : "database failure";
      }
    } else if (process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL) {
      databaseOk = false;
      databaseDetail = "DATABASE_URL set but prisma client unavailable";
    } else if (process.env.WINGMAN_PUBLIC_PROD === "true") {
      databaseOk = false;
      databaseDetail = "not-configured";
    }
    let mediaOk = true;
    let mediaDetail = this.media.name;
    try {
      mediaOk = await this.media.ping();
      if (!mediaOk) mediaDetail = `${this.media.name}:ping-failed`;
    } catch (e) {
      mediaOk = false;
      mediaDetail = e instanceof Error ? e.message : "media failure";
    }
    if (process.env.WINGMAN_PUBLIC_PROD === "true" && this.media.name === "memory") {
      mediaOk = false;
      mediaDetail = "memory-not-allowed-in-public-prod";
    }
    return buildReadiness({
      domain: { ok: true },
      ephemeral: { ok: redisOk, detail: redisDetail },
      persistence: { ok: persistenceOk, detail: persistenceDetail },
      database: { ok: databaseOk, detail: databaseDetail },
      media: { ok: mediaOk, detail: mediaDetail },
      destinyFlag: { ok: true, detail: String(this.engine.destinyEnabled) },
    });
  }

  measurementReport(fromIso?: string, toIso?: string) {
    const from = fromIso ? new Date(fromIso) : undefined;
    const to = toIso ? new Date(toIso) : undefined;
    return this.measurement?.report(from, to) ?? { enabled: false };
  }
}

@Public()
@Controller("internal")
export class InternalController {
  constructor(private readonly internal: InternalService) {}

  @Post("reconcile")
  reconcile() {
    return this.internal.reconcile();
  }

  @Get("metrics")
  metrics() {
    return this.internal.metrics();
  }

  /** Liveness — process is up (orchestration probes). Does not check deps. */
  @Get("live")
  live() {
    return {
      live: true,
      utc: new Date().toISOString(),
      livingMap: process.env.WINGMAN_LIVING_MAP_V1 === "true",
    };
  }

  @Get("ready")
  ready() {
    return this.internal.readiness();
  }

  /** S26 Measurement report — aggregates only; no lat/lng / PII */
  @Get("measurement/report")
  measurementReport(@Query("from") from?: string, @Query("to") to?: string) {
    return this.internal.measurementReport(from, to);
  }
}
