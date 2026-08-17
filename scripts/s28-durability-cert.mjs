#!/usr/bin/env node
/**
 * S28 Production durability cert (no secrets printed).
 *
 * Requires env from `vercel env pull` (Production):
 *   DATABASE_URL or DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING
 *   REDIS_URL (optional probe)
 *
 * Steps:
 *  1) Write protocol identity + connection via Prisma
 *  2) Read back (DB authority)
 *  3) Probe GET /internal/ready (must be prisma + redis + postgres)
 *  4) After API redeploy, re-read DB + ready again (caller may redeploy between)
 *
 * Usage:
 *   node scripts/s28-durability-cert.mjs
 *   node scripts/s28-durability-cert.mjs --after-redeploy
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

function mask(u) {
  if (!u) return "(unset)";
  try {
    const x = new URL(u.replace(/^postgres(ql)?:/i, "http:"));
    return `${x.protocol.replace("http", "postgres")}//***@${x.host}${x.pathname}`;
  } catch {
    return "(set, unparsed)";
  }
}

function dbUrl() {
  return (
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL
  );
}

const API = process.env.WINGMAN_API_URL || "https://wingman-api-three.vercel.app";
const afterRedeploy = process.argv.includes("--after-redeploy");
const markerId = process.env.S28_MARKER_ID || `s28_${randomUUID().slice(0, 8)}`;
const connectionId = process.env.S28_CONNECTION_ID || `s28c_${randomUUID().slice(0, 8)}`;

async function probeReady() {
  const res = await fetch(`${API}/internal/ready`);
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  const url = dbUrl();
  if (!url) {
    console.error(
      JSON.stringify({
        ok: false,
        step: "env",
        error: "No DATABASE_URL / UNPOOLED / PRISMA URL in env. Pull Production env first.",
      }),
    );
    process.exit(2);
  }

  console.log(
    JSON.stringify({
      msg: "s28.durability.start",
      api: API,
      database: mask(url),
      redis: mask(process.env.REDIS_URL),
      afterRedeploy,
      markerId,
      connectionId,
    }),
  );

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    if (!afterRedeploy) {
      const now = new Date();
      const expires = new Date(now.getTime() + 60 * 60 * 1000);
      const userPayload = {
        id: markerId,
        wingmanPlus: false,
        profile: {
          userId: markerId,
          gender: "MALE",
          interestedIn: ["WOMEN"],
          displayName: "S28 Durability",
        },
      };
      await prisma.protocolIdentity.upsert({
        where: { id: markerId },
        create: {
          id: markerId,
          gender: "MALE",
          interestedIn: ["WOMEN"],
          wingmanPlus: false,
          payload: userPayload,
        },
        update: { payload: userPayload },
      });

      const peerId = `${markerId}_peer`;
      const pairKey = [markerId, peerId].sort().join(":");
      const connPayload = {
        id: connectionId,
        pairKey,
        initiatorId: markerId,
        recipientId: peerId,
        state: "WAITING_FOR_INITIATOR_SELFIE",
        isActive: true,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };
      await prisma.protocolConnectionRow.upsert({
        where: { id: connectionId },
        create: {
          id: connectionId,
          pairKey,
          initiatorId: markerId,
          recipientId: peerId,
          isActive: true,
          state: "WAITING_FOR_INITIATOR_SELFIE",
          expiresAt: expires,
          payload: connPayload,
        },
        update: {
          pairKey,
          initiatorId: markerId,
          recipientId: peerId,
          isActive: true,
          state: "WAITING_FOR_INITIATOR_SELFIE",
          expiresAt: expires,
          payload: connPayload,
        },
      });
      console.log(JSON.stringify({ msg: "s28.durability.wrote", markerId, connectionId }));
    }

    const identity = await prisma.protocolIdentity.findUnique({ where: { id: markerId } });
    const connection = await prisma.protocolConnectionRow.findUnique({ where: { id: connectionId } });
    const ready = await probeReady();

    const persist = ready.body?.checks?.persistence?.detail;
    const ephemeral = ready.body?.checks?.ephemeral?.detail;
    const database = ready.body?.checks?.database?.detail;

    const redisOk = ephemeral === "redis";
    const report = {
      ok:
        Boolean(identity) &&
        Boolean(connection) &&
        connection.state === "WAITING_FOR_INITIATOR_SELFIE" &&
        ready.status === 200 &&
        ready.body?.ready === true &&
        persist === "prisma" &&
        redisOk &&
        database === "postgres",
      markerId,
      connectionId,
      identityFound: Boolean(identity),
      connectionState: connection?.state ?? null,
      ready: {
        ready: ready.body?.ready,
        persistence: persist,
        ephemeral,
        database,
      },
      next: afterRedeploy
        ? null
        : "Redeploy wingman-api Production, then: S28_MARKER_ID=... S28_CONNECTION_ID=... node scripts/s28-durability-cert.mjs --after-redeploy",
    };

    console.log(JSON.stringify({ msg: "s28.durability.result", ...report }));
    process.exit(report.ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
