import { Module } from "@nestjs/common";
import {
  DestinyV2Engine,
  MemoryDestinyProposalStore,
  createCooldownLedger,
  DEFAULT_DESTINY_POLICY,
} from "@wingman/destiny-v2";
import { SignalsModule } from "../signals/signals.module.js";
import { DestinyController, DestinyService } from "./destiny.controller.js";
import { DESTINY_V2_ENGINE, DESTINY_V2_STORE } from "./destiny.tokens.js";

let storeOverride: MemoryDestinyProposalStore | undefined;

export function setDestinyV2Overrides(opts: { store?: MemoryDestinyProposalStore }): void {
  storeOverride = opts.store;
}

@Module({
  imports: [SignalsModule],
  controllers: [DestinyController],
  providers: [
    {
      provide: DESTINY_V2_STORE,
      useFactory: () => storeOverride ?? new MemoryDestinyProposalStore(),
    },
    {
      provide: DESTINY_V2_ENGINE,
      useFactory: (store: MemoryDestinyProposalStore) =>
        new DestinyV2Engine(store, createCooldownLedger(), {
          ...DEFAULT_DESTINY_POLICY,
          // Production default: rarity controlled; tests may inject store + override env
          rarityPercent: Number(process.env.DESTINY_V2_RARITY_PERCENT ?? "35"),
          minScore: Number(process.env.DESTINY_V2_MIN_SCORE ?? "0.72"),
        }),
      inject: [DESTINY_V2_STORE],
    },
    DestinyService,
  ],
  exports: [DestinyService, DESTINY_V2_ENGINE],
})
export class DestinyModule {}
