import { Global, Module } from "@nestjs/common";
import { AuthService, KvAuthPersistence, redisAuthKv } from "@wingman/auth";
import { Redis } from "ioredis";
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
  createMobilePushTransportFromEnv,
  createOtpVerificationFromEnv,
  createSmsProviderFromEnv,
  FailClosedWebPushTransport,
  LoggingPushTransport,
  MemoryDeviceTokenStore,
  OtpDeliveryService,
  webPushCapabilityFromEnv,
  type DeviceTokenStore,
  type OtpVerificationProvider,
  type SmsProvider,
} from "@wingman/providers";
import { createMediaStoreFromEnv, MemoryMediaStore, type MediaStore } from "@wingman/media";
import type { WingmanEngine } from "@wingman/domain";
import { LOGGER, METRICS } from "../../common/observability.interceptor.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { setSkipProtocolHydrate } from "./infra-flags.js";
import { ProtocolBootService } from "./protocol-boot.service.js";
import {
  AUTH_SERVICE_TOKEN,
  DEVICE_TOKEN_STORE,
  EPHEMERAL_STORE,
  MEDIA_STORE,
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
  deviceTokens?: DeviceTokenStore;
  media?: MediaStore;
  /** When true, skip OnModuleInit hydrate (tests that inject pre-seeded engines). */
  skipHydrate?: boolean;
};

let sharedInfra: InfraOptions = {};
let protocolBootstrap: Promise<{ repo: ProtocolRepository; prisma: PrismaClient | null }> | null = null;
let sharedDeviceStore: DeviceTokenStore | null = null;

/** Public Production must never silently fall back to in-process memory stores. */
export function isPublicProd(): boolean {
  return process.env.WINGMAN_PUBLIC_PROD === "true";
}

export function setInfraOverrides(opts: InfraOptions): void {
  sharedInfra = opts;
  protocolBootstrap = null;
  sharedDeviceStore = opts.deviceTokens ?? null;
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
    } catch (e) {
      if (isPublicProd()) {
        throw new Error(
          `REDIS_URL unreachable in public production (no memory fallback): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  } else if (isPublicProd()) {
    throw new Error("REDIS_URL is required in public production (no memory ephemeral fallback)");
  }
  return new MemoryEphemeralStore();
}

async function buildAuth(): Promise<AuthService> {
  if (sharedInfra.auth) return sharedInfra.auth;
  const pepper = process.env.AUTH_PEPPER ?? "dev-pepper-change-me";
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      if (redis.status !== "ready") await redis.connect();
      sharedInfra.auth = new AuthService(pepper, () => new Date(), {
        persistence: new KvAuthPersistence(redisAuthKv(redis)),
      });
      return sharedInfra.auth;
    } catch (e) {
      if (isPublicProd()) {
        throw new Error(
          `REDIS_URL unreachable for durable sessions (no memory fallback): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  } else if (isPublicProd()) {
    throw new Error("REDIS_URL is required in public production (no memory session fallback)");
  }
  sharedInfra.auth = new AuthService(pepper);
  return sharedInfra.auth;
}

function buildSms(): SmsProvider {
  if (sharedInfra.sms) return sharedInfra.sms;
  try {
    return createSmsProviderFromEnv();
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "sms.provider_config_fallback_console",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return new ConsoleSmsProvider();
  }
}

function buildMedia(): MediaStore {
  if (sharedInfra.media) return sharedInfra.media;
  if (isPublicProd()) {
    const token = (process.env.MEDIA_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN ?? "").trim();
    const provider = (process.env.MEDIA_PROVIDER ?? "").trim().toLowerCase();
    if (!token || (provider && provider !== "vercel_blob")) {
      throw new Error(
        "Private selfie media required in public production: set MEDIA_PROVIDER=vercel_blob and BLOB_READ_WRITE_TOKEN (or MEDIA_BLOB_READ_WRITE_TOKEN)",
      );
    }
    process.env.MEDIA_PROVIDER = "vercel_blob";
  }
  try {
    return createMediaStoreFromEnv();
  } catch (e) {
    if (isPublicProd()) {
      throw new Error(
        `Media store unavailable in public production (no memory fallback): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    console.error(
      JSON.stringify({
        level: "error",
        msg: "media.provider_config_fallback_memory",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return new MemoryMediaStore();
  }
}

function buildOtpVerification(): OtpVerificationProvider | null {
  try {
    return createOtpVerificationFromEnv();
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "otp.verify_provider_config_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    // Fail closed for misconfigured Verify — do not silently fall back to local OTP in prod intent.
    throw e;
  }
}

function deviceStore(): DeviceTokenStore {
  if (!sharedDeviceStore) sharedDeviceStore = sharedInfra.deviceTokens ?? new MemoryDeviceTokenStore();
  return sharedDeviceStore;
}

function buildNotifications(): NotificationOrchestrator {
  if (sharedInfra.notifications) return sharedInfra.notifications;
  const mode = process.env.PUSH_PROVIDER ?? "memory";
  const web = webPushCapabilityFromEnv(process.env);
  if (mode === "logging") return new NotificationOrchestrator(new LoggingPushTransport());
  if (mode === "web") {
    return new NotificationOrchestrator(
      new FailClosedWebPushTransport(web.reason ?? "web_push_sender_not_provisioned"),
    );
  }
  if (mode === "mobile" || mode === "fcm" || mode === "apns") {
    return new NotificationOrchestrator(createMobilePushTransportFromEnv(deviceStore(), process.env));
  }
  if (isPublicProd()) {
    return new NotificationOrchestrator(
      new FailClosedWebPushTransport(
        web.enabled ? "web_push_sender_not_provisioned" : (web.reason ?? "vapid_or_fcm_credentials_missing"),
      ),
    );
  }
  return new NotificationOrchestrator(new InMemoryPushTransport());
}

function buildProtocolRepo(): Promise<{ repo: ProtocolRepository; prisma: PrismaClient | null }> {
  if (!protocolBootstrap) {
    protocolBootstrap = (async () => {
      if (sharedInfra.protocolRepo) {
        return { repo: sharedInfra.protocolRepo, prisma: sharedInfra.prisma ?? null };
      }
      // Neon/Vercel: prefer Prisma-pooled URL when present; else DATABASE_URL.
      const url = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL;
      if (url) {
        try {
          const prisma = sharedInfra.prisma ?? createPrismaClient(url);
          await pingDatabase(prisma);
          return { repo: new LivePrismaProtocolRepository(prisma), prisma };
        } catch (e) {
          console.error(
            JSON.stringify({
              level: "error",
              msg: isPublicProd()
                ? "protocol.prisma_unavailable_fail_closed"
                : "protocol.prisma_unavailable_fallback_memory",
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          if (isPublicProd()) {
            throw new Error(
              `DATABASE_URL/POSTGRES_PRISMA_URL unreachable in public production (no memory fallback): ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
        }
      } else if (isPublicProd()) {
        throw new Error(
          "DATABASE_URL (or POSTGRES_PRISMA_URL) is required in public production (no memory persistence fallback)",
        );
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
      useFactory: async () => buildAuth(),
    },
    {
      provide: DEVICE_TOKEN_STORE,
      useFactory: () => deviceStore(),
    },
    {
      provide: SMS_PROVIDER,
      useFactory: () => buildSms(),
    },
    {
      provide: MEDIA_STORE,
      useFactory: () => buildMedia(),
    },
    {
      provide: OTP_DELIVERY,
      useFactory: (auth: AuthService, sms: SmsProvider) =>
        new OtpDeliveryService(auth, sms, buildOtpVerification()),
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
    DEVICE_TOKEN_STORE,
    SMS_PROVIDER,
    MEDIA_STORE,
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
