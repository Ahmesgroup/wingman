import { Global, Module, type DynamicModule, type Provider } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import type { AuthService } from "@wingman/auth";
import type { WingmanEngine } from "@wingman/domain";
import type { MetricsRegistry, StructuredLogger } from "@wingman/observability";
import { DevAuthGuard, SessionAuthGuard } from "./common/auth.js";
import { DomainExceptionFilter } from "./common/domain-exception.filter.js";
import { LOGGER, METRICS, ObservabilityInterceptor } from "./common/observability.interceptor.js";
import { createEngine, EngineModule } from "./engine/engine.module.js";
import { WINGMAN_ENGINE } from "./engine/engine.tokens.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { AntiAbuseModule } from "./modules/anti-abuse/anti-abuse.module.js";
import { BillingModule, setBillingOverrides, type BillingOverrides } from "./modules/billing/billing.module.js";
import { ContextModule } from "./modules/context/context.module.js";
import { GeoModule } from "./modules/geo/geo.module.js";
import { MeasurementModule } from "./modules/measurement/measurement.module.js";
import { ConnectionsModule } from "./modules/connections/connections.module.js";
import { DestinyModule } from "./modules/destiny/destiny.module.js";
import { DevicesModule } from "./modules/devices/devices.module.js";
import { DevModule } from "./modules/dev/dev.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { InfraModule, setInfraOverrides, type InfraOptions } from "./modules/infra/infra.module.js";
import { AUTH_SERVICE_TOKEN } from "./modules/infra/infra.tokens.js";
import { InternalModule } from "./modules/internal/internal.module.js";
import { PrivacyModule } from "./modules/privacy/privacy.module.js";
import { RadarModule } from "./modules/radar/radar.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";
import { SafetyModule } from "./modules/safety/safety.module.js";
import { SignalsModule } from "./modules/signals/signals.module.js";

export type AppModuleOptions = InfraOptions &
  BillingOverrides & {
    engine?: WingmanEngine;
    useDevAuth?: boolean;
  };

@Global()
@Module({})
export class AppModule {
  static register(opts: AppModuleOptions = {}): DynamicModule {
    setInfraOverrides(opts);
    setBillingOverrides({
      stripePort: opts.stripePort,
      billingStore: opts.billingStore,
      paymentProvider: opts.paymentProvider,
    });
    process.env.AUTH_ALLOW_DEV = opts.useDevAuth === false ? "false" : "true";

    const engineProvider: Provider = {
      provide: WINGMAN_ENGINE,
      useFactory: () => opts.engine ?? createEngine(),
    };

    const authGuardProvider: Provider =
      opts.useDevAuth === false
        ? {
            provide: APP_GUARD,
            useFactory: (auth: AuthService, reflector: Reflector) => new SessionAuthGuard(auth, reflector),
            inject: [AUTH_SERVICE_TOKEN, Reflector],
          }
        : {
            provide: APP_GUARD,
            useFactory: (reflector: Reflector) => new DevAuthGuard(reflector),
            inject: [Reflector],
          };

    return {
      module: AppModule,
      global: true,
      imports: [
        EngineModule,
        InfraModule,
        BillingModule,
        AntiAbuseModule,
        MeasurementModule,
        GeoModule,
        ContextModule,
        HealthModule,
        DevModule,
        AuthModule,
        DevicesModule,
        RadarModule,
        SignalsModule,
        ConnectionsModule,
        SafetyModule,
        PrivacyModule,
        DestinyModule,
        InternalModule,
        RealtimeModule,
      ],
      providers: [
        engineProvider,
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
        authGuardProvider,
        {
          provide: APP_INTERCEPTOR,
          useFactory: (metrics: MetricsRegistry, logger: StructuredLogger) =>
            new ObservabilityInterceptor(metrics, logger),
          inject: [METRICS, LOGGER],
        },
      ],
      exports: [WINGMAN_ENGINE],
    };
  }
}
