import { afterEach, describe, expect, it } from "vitest";
import { setInfraOverrides } from "./modules/infra/infra.module.js";
import { createNestApp } from "./testing/create-nest-app.js";

describe("S28 public production fail-closed", () => {
  afterEach(() => {
    delete process.env.WINGMAN_PUBLIC_PROD;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.REDIS_URL;
    delete process.env.OTP_PROVIDER;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.MEDIA_BLOB_READ_WRITE_TOKEN;
    delete process.env.MEDIA_PROVIDER;
    setInfraOverrides({});
  });

  it("refuses memory ephemeral when REDIS_URL missing under WINGMAN_PUBLIC_PROD", async () => {
    process.env.WINGMAN_PUBLIC_PROD = "true";
    process.env.DATABASE_URL = "postgresql://invalid:invalid@127.0.0.1:1/wingman";
    delete process.env.REDIS_URL;
    delete process.env.OTP_PROVIDER;
    setInfraOverrides({});
    await expect(createNestApp({})).rejects.toThrow(/REDIS_URL|public production/i);
  });

  it("refuses memory persistence when DATABASE_URL missing under WINGMAN_PUBLIC_PROD", async () => {
    process.env.WINGMAN_PUBLIC_PROD = "true";
    // Provide a Redis URL that fails closed (no silent memory) once connect is attempted.
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.OTP_PROVIDER;
    setInfraOverrides({});
    await expect(createNestApp({})).rejects.toThrow(
      /DATABASE_URL|POSTGRES_PRISMA_URL|REDIS_URL|public production|ECONNREFUSED|unreachable/i,
    );
  });

  it("refuses memory media when blob token missing under WINGMAN_PUBLIC_PROD", async () => {
    process.env.WINGMAN_PUBLIC_PROD = "true";
    process.env.DATABASE_URL = "postgresql://invalid:invalid@127.0.0.1:1/wingman";
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.MEDIA_BLOB_READ_WRITE_TOKEN;
    delete process.env.MEDIA_PROVIDER;
    delete process.env.OTP_PROVIDER;
    setInfraOverrides({});
    await expect(createNestApp({})).rejects.toThrow(
      /media|BLOB_READ_WRITE_TOKEN|REDIS_URL|DATABASE_URL|public production|ECONNREFUSED|unreachable/i,
    );
  });
});
