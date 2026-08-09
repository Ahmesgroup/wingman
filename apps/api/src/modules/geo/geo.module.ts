import { Global, Module } from "@nestjs/common";
import {
  GeoIntelligenceEngine,
  MemoryGeoSnapshotStore,
  DEFAULT_GEO_POLICY,
  isGeoAdaptiveRadiusEnabled,
  isGeoIntelligenceEnabled,
  type GeoContextPort,
} from "@wingman/geo-intelligence";
import { GEO_CONTEXT_PORT, GEO_ENGINE, GEO_STORE } from "./geo.tokens.js";

let storeOverride: MemoryGeoSnapshotStore | undefined;
let engineOverride: GeoIntelligenceEngine | undefined;

export function setGeoOverrides(opts: {
  store?: MemoryGeoSnapshotStore;
  engine?: GeoIntelligenceEngine;
}): void {
  storeOverride = opts.store;
  engineOverride = opts.engine;
}

@Global()
@Module({
  providers: [
    {
      provide: GEO_STORE,
      useFactory: () => storeOverride ?? new MemoryGeoSnapshotStore(),
    },
    {
      provide: GEO_ENGINE,
      useFactory: (store: MemoryGeoSnapshotStore) => {
        if (engineOverride) return engineOverride;
        return new GeoIntelligenceEngine(store, DEFAULT_GEO_POLICY, isGeoAdaptiveRadiusEnabled());
      },
      inject: [GEO_STORE],
    },
    {
      provide: GEO_CONTEXT_PORT,
      useFactory: (engine: GeoIntelligenceEngine): GeoContextPort | undefined => {
        // Always provide engine as port; consumers check isGeoIntelligenceEnabled()
        return engine;
      },
      inject: [GEO_ENGINE],
    },
  ],
  exports: [GEO_ENGINE, GEO_STORE, GEO_CONTEXT_PORT],
})
export class GeoModule {}
