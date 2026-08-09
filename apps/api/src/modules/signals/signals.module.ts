import { Module } from "@nestjs/common";
import { SignalsController, SignalsService } from "./signals.controller.js";

@Module({
  controllers: [SignalsController],
  providers: [SignalsService],
  exports: [SignalsService],
})
export class SignalsModule {}
