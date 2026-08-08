import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule, type AppModuleOptions } from "../app.module.js";

export async function createNestApp(opts: AppModuleOptions = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ useDevAuth: true, skipHydrate: true, ...opts })],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
