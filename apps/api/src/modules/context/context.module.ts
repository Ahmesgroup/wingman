import { Global, Module } from "@nestjs/common";
import { ContextEngine, MemoryContextInputStore, isContextEngineEnabled } from "@wingman/context-engine";
import type { WingmanEngine } from "@wingman/domain";
import type { GeoContextPort } from "@wingman/geo-intelligence";
import { isGeoIntelligenceEnabled } from "@wingman/geo-intelligence";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { GEO_CONTEXT_PORT } from "../geo/geo.tokens.js";
import { ContextToRadarAdapter, NestContextInputsPort } from "./context.adapter.js";
import { CONTEXT_ENGINE, CONTEXT_INPUT_STORE, RADAR_CONTEXT_PORT } from "./context.tokens.js";

let storeOverride: MemoryContextInputStore | undefined;

/** Test hooks */
export function setContextEngineOverrides(opts: { store?: MemoryContextInputStore }): void {
  storeOverride = opts.store;
}

@Global()
@Module({
  providers: [
    {
      provide: CONTEXT_INPUT_STORE,
      useFactory: () => storeOverride ?? new MemoryContextInputStore(),
    },
    {
      provide: CONTEXT_ENGINE,
      useFactory: (
        store: MemoryContextInputStore,
        engine: WingmanEngine,
        geo?: GeoContextPort,
      ) => {
        const geoPort = isGeoIntelligenceEnabled() ? geo : undefined;
        const inputs = new NestContextInputsPort(store, engine, geoPort);
        return new ContextEngine(inputs, () => isContextEngineEnabled());
      },
      inject: [CONTEXT_INPUT_STORE, WINGMAN_ENGINE, { token: GEO_CONTEXT_PORT, optional: true }],
    },
    {
      provide: RADAR_CONTEXT_PORT,
      useFactory: (engine: ContextEngine) => new ContextToRadarAdapter(engine),
      inject: [CONTEXT_ENGINE],
    },
  ],
  exports: [CONTEXT_ENGINE, CONTEXT_INPUT_STORE, RADAR_CONTEXT_PORT],
})
export class ContextModule {}
