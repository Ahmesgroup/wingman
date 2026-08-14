import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

/** Public production must never accept x-user-id. Local/dev opts in via AUTH_ALLOW_DEV=true. */
function resolveUseDevAuth(): boolean {
  const publicProd =
    process.env.WINGMAN_PUBLIC_PROD === "true" || process.env.NODE_ENV === "production";
  if (publicProd) return false;
  return process.env.AUTH_ALLOW_DEV === "true";
}

async function bootstrap() {
  const useDevAuth = resolveUseDevAuth();
  const app = await NestFactory.create(AppModule.register({ useDevAuth }), { rawBody: true });
  app.enableCors({ origin: true, credentials: true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(
    JSON.stringify({
      msg: "Wingman Nest API listening",
      port,
      utc: new Date().toISOString(),
      destiny: process.env.DESTINY_ENABLED === "true",
      authAllowDev: useDevAuth,
      publicProd: process.env.WINGMAN_PUBLIC_PROD === "true" || process.env.NODE_ENV === "production",
    }),
  );
}

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
