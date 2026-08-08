import { Module } from "@nestjs/common";
import { DevController, DevService } from "./dev.controller.js";

@Module({ controllers: [DevController], providers: [DevService] })
export class DevModule {}
