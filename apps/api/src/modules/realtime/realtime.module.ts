import { Global, Module } from "@nestjs/common";
import type { EphemeralStore } from "@wingman/ephemeral";
import { RealtimeHub } from "@wingman/realtime";
import { EPHEMERAL_STORE } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "./realtime-app.service.js";
import { RealtimeGateway } from "./realtime.gateway.js";
import { REALTIME_HUB } from "./realtime.tokens.js";

let hubOverride: RealtimeHub | undefined;

export function setRealtimeHubOverride(hub?: RealtimeHub): void {
  hubOverride = hub;
}

@Global()
@Module({
  providers: [
    {
      provide: REALTIME_HUB,
      useFactory: (ephemeral: EphemeralStore) => hubOverride ?? new RealtimeHub(ephemeral),
      inject: [EPHEMERAL_STORE],
    },
    // Service before gateway (TDZ / decorator metadata ordering)
    RealtimeAppService,
    RealtimeGateway,
  ],
  exports: [REALTIME_HUB, RealtimeAppService],
})
export class RealtimeModule {}
