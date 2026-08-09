import { Global, Module } from "@nestjs/common";
import { ContextEngine, MemoryContextInputStore, isContextEngineEnabled } from "@wingman/context-engine";
import type { WingmanEngine } from "@wingman/domain";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
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
      useFactory: (store: MemoryContextInputStore, engine: WingmanEngine) => {
        const inputs = new NestContextInputsPort(store, engine);
        return new ContextEngine(inputs, () => isContextEngineEnabled());
      },
      inject: [CONTEXT_INPUT_STORE, WINGMAN_ENGINE],
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
