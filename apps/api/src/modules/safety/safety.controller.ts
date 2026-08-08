import { Body, Controller, Inject, Injectable, Post } from "@nestjs/common";
import { BlockSchema, ReportSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";

@Injectable()
export class SafetyService {
  constructor(@Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine) {}

  block(actorId: string, targetId: string) {
    return this.engine.blockUser(actorId, targetId);
  }

  report(actorId: string, body: { userId: string; category: string; connectionId?: string }) {
    return this.engine.reportUser(actorId, body.userId, body.category, body.connectionId);
  }
}

@Controller("safety")
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post("block")
  block(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(BlockSchema)) body: { userId: string },
  ) {
    return { block: this.safety.block(userId, body.userId) };
  }

  @Post("report")
  report(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(ReportSchema))
    body: { userId: string; category: string; connectionId?: string },
  ) {
    return { report: this.safety.report(userId, body) };
  }
}
