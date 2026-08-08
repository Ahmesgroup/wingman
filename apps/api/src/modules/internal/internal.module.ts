import { Module } from "@nestjs/common";
import { InternalController, InternalService } from "./internal.controller.js";

@Module({ controllers: [InternalController], providers: [InternalService] })
export class InternalModule {}
