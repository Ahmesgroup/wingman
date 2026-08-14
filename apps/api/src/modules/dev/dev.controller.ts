import { Body, Controller, ForbiddenException, Inject, Injectable, Post } from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { Public } from "../../common/public.decorator.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { PROTOCOL_MIRROR } from "../infra/infra.tokens.js";

@Injectable()
export class DevService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
  ) {}

  async seed(body: {
    id: string;
    gender: "MALE" | "FEMALE" | "NON_BINARY";
    interestedIn: Array<"MEN" | "WOMEN" | "NON_BINARY_PEOPLE">;
    wingmanPlus?: boolean;
  }) {
    this.engine.seedUser({
      id: body.id,
      wingmanPlus: Boolean(body.wingmanPlus),
      profile: { userId: body.id, gender: body.gender, interestedIn: body.interestedIn },
    });
    await this.mirror.mirrorUser(body.id);
    return { id: body.id };
  }
}

@Public()
@Controller("dev")
export class DevController {
  constructor(private readonly dev: DevService) {}

  @Post("seed")
  seed(
    @Body()
    body: {
      id: string;
      gender: "MALE" | "FEMALE" | "NON_BINARY";
      interestedIn: Array<"MEN" | "WOMEN" | "NON_BINARY_PEOPLE">;
      wingmanPlus?: boolean;
    },
  ) {
    if (process.env.AUTH_ALLOW_DEV !== "true") {
      throw new ForbiddenException({
        error: { code: "DEV_DISABLED", message: "Dev seed is disabled outside AUTH_ALLOW_DEV" },
      });
    }
    return this.dev.seed(body);
  }
}
