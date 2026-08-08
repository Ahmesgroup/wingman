import { Module } from "@nestjs/common";
import { RadarController, RadarService } from "./radar.controller.js";

@Module({
  controllers: [RadarController],
  providers: [RadarService],
  exports: [RadarService],
})
export class RadarModule {}
