import { Module, forwardRef } from "@nestjs/common";
import { DestinyModule } from "../destiny/destiny.module.js";
import { SafetyController, SafetyService } from "./safety.controller.js";

@Module({
  imports: [forwardRef(() => DestinyModule)],
  controllers: [SafetyController],
  providers: [SafetyService],
})
export class SafetyModule {}
