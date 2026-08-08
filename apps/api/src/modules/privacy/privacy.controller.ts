import { Body, Controller, Inject, Injectable, Post } from "@nestjs/common";
import { ConsentSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";

@Injectable()
export class PrivacyService {
  constructor(@Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine) {}

  consent(userId: string, purpose: string, policyVersion: string) {
    return this.engine.grantConsent(userId, purpose, policyVersion);
  }
}

@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post("consent")
  consent(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(ConsentSchema)) body: { purpose: string; policyVersion: string },
  ) {
    return { consent: this.privacy.consent(userId, body.purpose, body.policyVersion) };
  }
}
