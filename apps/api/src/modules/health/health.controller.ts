import { Controller, Get, Inject, Injectable } from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import { Public } from "../../common/public.decorator.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";

@Injectable()
export class HealthService {
  constructor(@Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine) {}

  health() {
    try {
      return {
        ok: true,
        utc: this.engine.clock.now().toISOString(),
        destinyEnabled: this.engine.destinyEnabled,
      };
    } catch {
      return { ok: true, utc: new Date().toISOString(), destinyEnabled: false };
    }
  }
}

@Public()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health")
  health() {
    return this.healthService?.health?.() ?? { ok: true, utc: new Date().toISOString() };
  }
}
