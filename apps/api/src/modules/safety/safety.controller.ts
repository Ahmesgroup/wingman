import { Body, Controller, Inject, Injectable, Optional, Post, forwardRef } from "@nestjs/common";
import { BlockSchema, ReportSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { PROTOCOL_MIRROR } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "../realtime/realtime-app.service.js";
import { DestinyService } from "../destiny/destiny.controller.js";
import { AntiAbuseGate } from "../anti-abuse/anti-abuse.module.js";
import { MeasurementGate } from "../measurement/measurement.module.js";

@Injectable()
export class SafetyService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
    private readonly realtime: RealtimeAppService,
    @Optional()
    @Inject(forwardRef(() => DestinyService))
    private readonly destiny?: DestinyService,
    @Optional() private readonly antiAbuse?: AntiAbuseGate,
    @Optional() private readonly measurement?: MeasurementGate,
  ) {}

  async block(actorId: string, targetId: string) {
    const existed = this.engine.blocks.some((b) => b.blockerId === actorId && b.blockedId === targetId);
    const block = this.engine.blockUser(actorId, targetId);
    if (existed) return block;
    await this.destiny?.invalidateForBlock(actorId, targetId);
    this.antiAbuse?.noteBlock(actorId, targetId);
    this.measurement?.noteDecision("CORE_SAFETY", "1.0.0", "block_issued", { actorId });
    this.measurement?.noteOutcome("block.issued");
    await this.mirror.mirrorLatestBlock();
    await this.mirror.mirrorAll();
    for (const c of this.engine.connections.values()) {
      if (
        (c.initiatorId === actorId && c.recipientId === targetId) ||
        (c.initiatorId === targetId && c.recipientId === actorId)
      ) {
        await this.realtime.publish({
          type: "connection.closed",
          aggregateId: c.id,
          rooms: [
            this.realtime.userRoom(c.initiatorId),
            this.realtime.userRoom(c.recipientId),
            this.realtime.connectionRoom(c.id),
          ],
          payload: { connectionId: c.id, state: c.state, reason: "block" },
        });
      }
    }
    return block;
  }

  async report(actorId: string, body: { userId: string; category: string; connectionId?: string }) {
    const report = this.engine.reportUser(actorId, body.userId, body.category, body.connectionId);
    await this.mirror.mirrorLatestReport();
    return report;
  }
}

@Controller("safety")
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post("block")
  async block(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(BlockSchema)) body: { userId: string },
  ) {
    return { block: await this.safety.block(userId, body.userId) };
  }

  @Post("report")
  async report(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(ReportSchema))
    body: { userId: string; category: string; connectionId?: string },
  ) {
    return { report: await this.safety.report(userId, body) };
  }
}
