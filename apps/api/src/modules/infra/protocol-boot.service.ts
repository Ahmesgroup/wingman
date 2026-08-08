import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import { hydrateFromRepository, type ProtocolRepository } from "@wingman/persistence";
import type { StructuredLogger } from "@wingman/observability";
import { LOGGER } from "../../common/observability.interceptor.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { shouldSkipProtocolHydrate } from "./infra-flags.js";
import { PROTOCOL_REPO } from "./infra.tokens.js";

/**
 * S16 boot: reconstruct durable protocol state from PostgreSQL (or memory repo in tests).
 * Presence is never hydrated — clients must re-activate radar.
 */
@Injectable()
export class ProtocolBootService implements OnModuleInit {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(PROTOCOL_REPO) private readonly repo: ProtocolRepository,
    @Inject(LOGGER) private readonly logger: StructuredLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    if (shouldSkipProtocolHydrate()) {
      this.logger.info("protocol.hydrate.skipped", { reason: "skipHydrate" });
      return;
    }
    const report = await hydrateFromRepository(this.engine, this.repo);
    this.logger.info("protocol.hydrated", {
      repo: this.repo.name,
      ...report,
      reconciledSignals: report.reconciled.signals.length,
      reconciledConnections: report.reconciled.connections.length,
    });
  }
}
