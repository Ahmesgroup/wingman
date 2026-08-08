import { Global, Module } from "@nestjs/common";
import { AuthService } from "@wingman/auth";
import { createPrismaClient, pingDatabase, type PrismaClient } from "@wingman/database";
import { MemoryEphemeralStore, RedisEphemeralStore, type EphemeralStore } from "@wingman/ephemeral";
import { InMemoryPushTransport, NotificationOrchestrator } from "@wingman/notifications";
import { MetricsRegistry, StructuredLogger } from "@wingman/observability";
import {
  LivePrismaProtocolRepository,
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
import { setSkipProtocolHydrate } from "./infra-flags.js";
import { ProtocolBootService } from "./protocol-boot.service.js";
import {
  AUTH_SERVICE_TOKEN,
  EPHEMERAL_STORE,
  NOTIFICATION_ORCH,
  OTP_DELIVERY,
  PRISMA_CLIENT,
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
  prisma?: PrismaClient;
  sms?: SmsProvider;
  /** When true, skip OnModuleInit hydrate (tests that inject pre-seeded engines). */
  skipHydrate?: boolean;
};

let sharedInfra: InfraOptions = {};
let protocolBootstrap: Promise<{ repo: ProtocolRepository; prisma: PrismaClient | null }> | null = null;

export function setInfraOverrides(opts: InfraOptions): void {
  sharedInfra = opts;
  protocolBootstrap = null;
  setSkipProtocolHydrate(opts.skipHydrate === true);
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

function buildProtocolRepo(): Promise<{ repo: ProtocolRepository; prisma: PrismaClient | null }> {
  if (!protocolBootstrap) {
    protocolBootstrap = (async () => {
      if (sharedInfra.protocolRepo) {
        return { repo: sharedInfra.protocolRepo, prisma: sharedInfra.prisma ?? null };
      }
      const url = process.env.DATABASE_URL;
      if (url) {
        try {
          const prisma = sharedInfra.prisma ?? createPrismaClient(url);
          await pingDatabase(prisma);
          return { repo: new LivePrismaProtocolRepository(prisma), prisma };
        } catch (e) {
          console.error(
            JSON.stringify({
              level: "error",
              msg: "protocol.prisma_unavailable_fallback_memory",
              error: e instanceof Error ? e.message : String(e),
            }),
          );
        }
      }
      return { repo: new MemoryProtocolRepository(), prisma: null };
    })();
  }
  return protocolBootstrap;
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
      useFactory: async () => (await buildProtocolRepo()).repo,
    },
    {
      provide: PRISMA_CLIENT,
      useFactory: async () => (await buildProtocolRepo()).prisma,
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
    ProtocolBootService,
  ],
  exports: [
    EPHEMERAL_STORE,
    AUTH_SERVICE_TOKEN,
    SMS_PROVIDER,
    OTP_DELIVERY,
    NOTIFICATION_ORCH,
    PROTOCOL_REPO,
    PRISMA_CLIENT,
    PROTOCOL_MIRROR,
    METRICS,
    LOGGER,
  ],
})
export class InfraModule {}
