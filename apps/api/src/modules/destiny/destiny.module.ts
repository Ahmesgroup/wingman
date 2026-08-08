import { Module } from "@nestjs/common";
import { DestinyController, DestinyService } from "./destiny.controller.js";

@Module({ controllers: [DestinyController], providers: [DestinyService] })
export class DestinyModule {}
