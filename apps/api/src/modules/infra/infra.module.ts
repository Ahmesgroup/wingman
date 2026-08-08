import { Global, Module } from "@nestjs/common";
import { AuthService } from "@wingman/auth";
import { MemoryEphemeralStore, RedisEphemeralStore, type EphemeralStore } from "@wingman/ephemeral";
import { InMemoryPushTransport, NotificationOrchestrator } from "@wingman/notifications";
import { MetricsRegistry, StructuredLogger } from "@wingman/observability";
import { LOGGER, METRICS } from "../../common/observability.interceptor.js";
import { AUTH_SERVICE_TOKEN, EPHEMERAL_STORE, NOTIFICATION_ORCH } from "./infra.tokens.js";

export type InfraOptions = {
  ephemeral?: EphemeralStore;
  auth?: AuthService;
  notifications?: NotificationOrchestrator;
  metrics?: MetricsRegistry;
  logger?: StructuredLogger;
};

let sharedInfra: InfraOptions = {};

export function setInfraOverrides(opts: InfraOptions): void {
  sharedInfra = opts;
}

async function buildEphemeral(): Promise<EphemeralStore> {
  if (sharedInfra.ephemeral) return sharedInfra.ephemeral;
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const store = RedisEphemeralStore.fromUrl(url);
      await store.connect();
      return store;
    } catch {
      // fall through to memory
    }
  }
  return new MemoryEphemeralStore();
}

@Global()
@Module({
  providers: [
    {
      provide: EPHEMERAL_STORE,
      useFactory: async () => buildEphemeral(),
    },
    {
      provide: AUTH_SERVICE_TOKEN,
      useFactory: () =>
        sharedInfra.auth ?? new AuthService(process.env.AUTH_PEPPER ?? "dev-pepper-change-me"),
    },
    {
      provide: NOTIFICATION_ORCH,
      useFactory: () =>
        sharedInfra.notifications ?? new NotificationOrchestrator(new InMemoryPushTransport()),
    },
    {
      provide: METRICS,
      useFactory: () => sharedInfra.metrics ?? new MetricsRegistry(),
    },
    {
      provide: LOGGER,
      useFactory: () => sharedInfra.logger ?? new StructuredLogger("wingman-api"),
    },
  ],
  exports: [EPHEMERAL_STORE, AUTH_SERVICE_TOKEN, NOTIFICATION_ORCH, METRICS, LOGGER],
})
export class InfraModule {}
