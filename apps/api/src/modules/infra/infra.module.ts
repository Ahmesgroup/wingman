import { Global, Module } from "@nestjs/common";
import { AuthService } from "@wingman/auth";
import { MemoryEphemeralStore, RedisEphemeralStore, type EphemeralStore } from "@wingman/ephemeral";
import { InMemoryPushTransport, NotificationOrchestrator } from "@wingman/notifications";
import { MetricsRegistry, StructuredLogger } from "@wingman/observability";
import {
  MemoryProtocolRepository,
  ProtocolPersistenceMirror,
  type ProtocolRepository,
} from "@wingman/persistence";
import {
  ConsoleSmsProvider,
  LoggingPushTransport,
  NoopSmsProvider,
  OtpDeliveryService,
  type SmsProvider,
} from "@wingman/providers";
import type { WingmanEngine } from "@wingman/domain";
import { LOGGER, METRICS } from "../../common/observability.interceptor.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import {
  AUTH_SERVICE_TOKEN,
  EPHEMERAL_STORE,
  NOTIFICATION_ORCH,
  OTP_DELIVERY,
  PROTOCOL_MIRROR,
  PROTOCOL_REPO,
  SMS_PROVIDER,
} from "./infra.tokens.js";

export type InfraOptions = {
  ephemeral?: EphemeralStore;
  auth?: AuthService;
  notifications?: NotificationOrchestrator;
  metrics?: MetricsRegistry;
  logger?: StructuredLogger;
  protocolRepo?: ProtocolRepository;
  sms?: SmsProvider;
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

function buildSms(): SmsProvider {
  if (sharedInfra.sms) return sharedInfra.sms;
  if (process.env.SMS_PROVIDER === "noop") return new NoopSmsProvider();
  return new ConsoleSmsProvider();
}

function buildNotifications(): NotificationOrchestrator {
  if (sharedInfra.notifications) return sharedInfra.notifications;
  const transport =
    process.env.PUSH_PROVIDER === "logging" ? new LoggingPushTransport() : new InMemoryPushTransport();
  return new NotificationOrchestrator(transport);
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
      provide: SMS_PROVIDER,
      useFactory: () => buildSms(),
    },
    {
      provide: OTP_DELIVERY,
      useFactory: (auth: AuthService, sms: SmsProvider) => new OtpDeliveryService(auth, sms),
      inject: [AUTH_SERVICE_TOKEN, SMS_PROVIDER],
    },
    {
      provide: NOTIFICATION_ORCH,
      useFactory: () => buildNotifications(),
    },
    {
      provide: PROTOCOL_REPO,
      useFactory: () => sharedInfra.protocolRepo ?? new MemoryProtocolRepository(),
    },
    {
      provide: PROTOCOL_MIRROR,
      useFactory: (engine: WingmanEngine, repo: ProtocolRepository) =>
        new ProtocolPersistenceMirror(engine, repo),
      inject: [WINGMAN_ENGINE, PROTOCOL_REPO],
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
  exports: [
    EPHEMERAL_STORE,
    AUTH_SERVICE_TOKEN,
    SMS_PROVIDER,
    OTP_DELIVERY,
    NOTIFICATION_ORCH,
    PROTOCOL_REPO,
    PROTOCOL_MIRROR,
    METRICS,
    LOGGER,
  ],
})
export class InfraModule {}
