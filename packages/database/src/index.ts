import { PrismaClient } from "@prisma/client";

export { PrismaClient };

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for live Prisma persistence");
  }
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

export async function pingDatabase(client: PrismaClient): Promise<boolean> {
  await client.$queryRaw`SELECT 1`;
  return true;
}
