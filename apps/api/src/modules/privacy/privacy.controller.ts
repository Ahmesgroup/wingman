import { Body, Controller, Inject, Injectable, Post } from "@nestjs/common";
import { ConsentSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { PROTOCOL_MIRROR } from "../infra/infra.tokens.js";

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
  ) {}

  async consent(userId: string, purpose: string, policyVersion: string) {
    const consent = this.engine.grantConsent(userId, purpose, policyVersion);
    await this.mirror.mirrorLatestConsent();
    return consent;
  }
}

@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post("consent")
  async consent(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(ConsentSchema)) body: { purpose: string; policyVersion: string },
  ) {
    return { consent: await this.privacy.consent(userId, body.purpose, body.policyVersion) };
  }
}
