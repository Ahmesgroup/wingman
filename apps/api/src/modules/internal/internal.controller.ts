import { Controller, Get, Inject, Injectable, Post } from "@nestjs/common";
import type { EphemeralStore } from "@wingman/ephemeral";
import type { WingmanEngine } from "@wingman/domain";
import type { MetricsRegistry } from "@wingman/observability";
import { buildReadiness } from "@wingman/observability";
import { METRICS } from "../../common/observability.interceptor.js";
import { Public } from "../../common/public.decorator.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE } from "../infra/infra.tokens.js";

@Injectable()
export class InternalService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(METRICS) private readonly metricsRegistry: MetricsRegistry,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
  ) {}

  reconcile() {
    return this.engine.reconcile();
  }

  metrics() {
    return {
      users: this.engine.users.size,
      online: [...this.engine.presence.values()].filter((p) => p.online).length,
      activeSignals: [...this.engine.signals.values()].filter((s) => s.isActive).length,
      activeConnections: [...this.engine.connections.values()].filter((c) => c.isActive).length,
      locks: this.engine.locks.size,
      events: this.engine.events.length,
      audits: this.engine.audits.length,
      destinyEnabled: this.engine.destinyEnabled,
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
    return buildReadiness({
      domain: { ok: true },
      ephemeral: { ok: redisOk, detail: redisDetail },
      destinyFlag: { ok: true, detail: String(this.engine.destinyEnabled) },
    });
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

  @Get("ready")
  ready() {
    return this.internal.readiness();
  }
}
