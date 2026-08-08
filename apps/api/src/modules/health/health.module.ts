import { Module } from "@nestjs/common";
import { HealthController, HealthService } from "./health.controller.js";

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
