import { Body, Controller, Inject, Injectable, Post } from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import { Public } from "../../common/public.decorator.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";

@Injectable()
export class DevService {
  constructor(@Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine) {}

  seed(body: {
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
    return this.dev.seed(body);
  }
}
