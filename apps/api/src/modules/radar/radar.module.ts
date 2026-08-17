import { Global, Module } from "@nestjs/common";
import { ExposureStore } from "@wingman/radar-intelligence";
import { DestinyModule } from "../destiny/destiny.module.js";
import { RadarController, RadarService, type LanguageHints } from "./radar.controller.js";
import { RADAR_EXPOSURE_STORE, RADAR_LANGUAGE_HINTS } from "./radar.tokens.js";

let languageHintsOverride: LanguageHints | undefined;
let exposureOverride: ExposureStore | undefined;

/** Test hooks — production uses defaults. */
export function setRadarIntelligenceOverrides(opts: {
  languageHints?: LanguageHints;
  exposure?: ExposureStore;
}): void {
  languageHintsOverride = opts.languageHints;
  exposureOverride = opts.exposure;
}

@Global()
@Module({
  imports: [DestinyModule],
  controllers: [RadarController],
  providers: [
    RadarService,
    {
      provide: RADAR_EXPOSURE_STORE,
      useFactory: () => exposureOverride ?? new ExposureStore(),
    },
    {
      provide: RADAR_LANGUAGE_HINTS,
      useFactory: () => languageHintsOverride ?? new Map<string, string[]>(),
    },
  ],
  exports: [RadarService, RADAR_EXPOSURE_STORE, RADAR_LANGUAGE_HINTS],
})
export class RadarModule {}
