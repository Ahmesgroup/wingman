import { Module } from "@nestjs/common";
import { DevicesController, DevicesService } from "./devices.controller.js";

@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
