import { Module } from "@nestjs/common";
import {
  DestinyV2Engine,
  MemoryDestinyProposalStore,
  RedisDestinyProposalStore,
  createCooldownLedger,
  DEFAULT_DESTINY_POLICY,
  type DestinyProposalStore,
} from "@wingman/destiny-v2";
import { SignalsModule } from "../signals/signals.module.js";
import { DestinyController, DestinyService } from "./destiny.controller.js";
import { DESTINY_V2_ENGINE, DESTINY_V2_STORE } from "./destiny.tokens.js";

let storeOverride: DestinyProposalStore | undefined;

export function setDestinyV2Overrides(opts: { store?: DestinyProposalStore }): void {
  storeOverride = opts.store;
}

async function buildDestinyProposalStore(): Promise<DestinyProposalStore> {
  if (storeOverride) return storeOverride;
  const url = process.env.REDIS_URL;
  if (url && process.env.DESTINY_V2_STORE !== "memory") {
    try {
      const store = RedisDestinyProposalStore.fromUrl(url);
      await store.connect();
      return store;
    } catch {
      // fall through
    }
  }
  return new MemoryDestinyProposalStore();
}

@Module({
  imports: [SignalsModule],
  controllers: [DestinyController],
  providers: [
    {
      provide: DESTINY_V2_STORE,
      useFactory: () => buildDestinyProposalStore(),
    },
    {
      provide: DESTINY_V2_ENGINE,
      useFactory: async (store: DestinyProposalStore) => {
        const resolved = await Promise.resolve(store);
        return new DestinyV2Engine(resolved, createCooldownLedger(), {
          ...DEFAULT_DESTINY_POLICY,
          rarityPercent: Number(process.env.DESTINY_V2_RARITY_PERCENT ?? "35"),
          minScore: Number(process.env.DESTINY_V2_MIN_SCORE ?? "0.72"),
        });
      },
      inject: [DESTINY_V2_STORE],
    },
    DestinyService,
  ],
  exports: [DestinyService, DESTINY_V2_ENGINE],
})
export class DestinyModule {}
