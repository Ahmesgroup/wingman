import { Module } from "@nestjs/common";
import { MeController, MeService } from "./me.controller.js";

@Module({ controllers: [MeController], providers: [MeService] })
export class MeModule {}
