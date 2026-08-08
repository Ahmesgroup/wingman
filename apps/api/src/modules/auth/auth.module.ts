import { Module } from "@nestjs/common";
import { AuthController, AuthApiService } from "./auth.controller.js";

@Module({ controllers: [AuthController], providers: [AuthApiService] })
export class AuthModule {}
