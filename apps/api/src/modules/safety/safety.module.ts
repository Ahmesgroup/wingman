import { Module } from "@nestjs/common";
import { SafetyController, SafetyService } from "./safety.controller.js";

@Module({ controllers: [SafetyController], providers: [SafetyService] })
export class SafetyModule {}
