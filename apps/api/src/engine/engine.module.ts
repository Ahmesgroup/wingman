import { Global, Module } from "@nestjs/common";
import { FakeClock, WingmanEngine } from "@wingman/domain";

export type EngineFactoryOptions = {
  clock?: FakeClock;
  destinyEnabled?: boolean;
  engine?: WingmanEngine;
};

export function createEngine(opts: EngineFactoryOptions = {}): WingmanEngine {
  if (opts.engine) return opts.engine;
  return new WingmanEngine({
    clock: opts.clock,
    destinyEnabled: opts.destinyEnabled ?? process.env.DESTINY_ENABLED === "true",
  });
}

/** Token export only — provider is registered by AppModule.register */
@Global()
@Module({})
export class EngineModule {}
