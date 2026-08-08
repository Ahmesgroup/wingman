import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule.register({ useDevAuth: true }), { rawBody: true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(
    JSON.stringify({
      msg: "Wingman Nest API listening",
      port,
      utc: new Date().toISOString(),
      destiny: process.env.DESTINY_ENABLED === "true",
    }),
  );
}

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
