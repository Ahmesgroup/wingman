import { Body, Controller, Inject, Injectable, Post } from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import { CurrentUser } from "../../common/auth.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";

@Injectable()
export class DestinyService {
  constructor(@Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine) {}

  copresence(userId: string, otherUserId: string) {
    const copresence = this.engine.noteCopresence(userId, otherUserId);
    const emitted = this.engine.tryDestinyPrompt(userId, otherUserId);
    return { copresence, promptEmitted: emitted };
  }
}

@Controller("destiny")
export class DestinyController {
  constructor(private readonly destiny: DestinyService) {}

  @Post("copresence")
  copresence(@CurrentUser() userId: string, @Body() body: { otherUserId: string }) {
    return this.destiny.copresence(userId, body.otherUserId);
  }
}
