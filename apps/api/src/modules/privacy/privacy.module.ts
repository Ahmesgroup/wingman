import { Module } from "@nestjs/common";
import { PrivacyController, PrivacyService } from "./privacy.controller.js";

@Module({ controllers: [PrivacyController], providers: [PrivacyService] })
export class PrivacyModule {}
