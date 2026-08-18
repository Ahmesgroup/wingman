import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryMediaStore } from "@wingman/media";
import { createNestApp } from "./testing/create-nest-app.js";
import { uploadSelfieMedia } from "./testing/selfie-media.js";

function candidateIds(body: { candidates?: Array<{ userId: string }> }): string[] {
  return (body.candidates ?? []).map((c) => c.userId);
}

function opportunityIds(body: { opportunities?: Array<{ userId: string }> }): string[] {
  return (body.opportunities ?? []).map((c) => c.userId);
}

async function seedEligiblePair(server: import("http").Server) {
  await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
  await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
  await request(server).post("/dev/seed").send({ id: "stranger", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
  await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
  await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
}

async function openConnection(server: import("http").Server, key = "s33-k1") {
  const signalRes = await request(server)
    .post("/signals")
    .set("x-user-id", "a")
    .set("idempotency-key", key)
    .send({ receiverId: "b", source: "RADAR" })
    .expect(201);
  await request(server).post(`/signals/${signalRes.body.signal.id}/open`).set("x-user-id", "b").expect(201);
  const accept = await request(server)
    .post(`/signals/${signalRes.body.signal.id}/accept`)
    .set("x-user-id", "b")
    .expect(201);
  return { signalId: signalRes.body.signal.id as string, connectionId: accept.body.connection.id as string };
}

describe("S33 safety product path", () => {
  it("block removes the pair from Radar and Discover; Signal is refused", async () => {
    const clock = new FakeClock(new Date("2026-08-18T15:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();
    await seedEligiblePair(server);

    expect(candidateIds((await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200)).body)).toEqual([
      "b",
    ]);
    expect(
      opportunityIds((await request(server).get("/radar/opportunities").set("x-user-id", "a").expect(200)).body),
    ).toContain("b");

    await request(server).post("/safety/block").set("x-user-id", "a").send({ userId: "b" }).expect(201);

    expect(candidateIds((await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200)).body)).not.toContain(
      "b",
    );
    expect(candidateIds((await request(server).get("/radar/candidates").set("x-user-id", "b").expect(200)).body)).not.toContain(
      "a",
    );
    expect(
      opportunityIds((await request(server).get("/radar/opportunities").set("x-user-id", "a").expect(200)).body),
    ).not.toContain("b");

    await request(server)
      .post("/signals")
      .set("x-user-id", "a")
      .set("idempotency-key", "s33-blocked-signal")
      .send({ receiverId: "b", source: "RADAR" })
      .expect(403)
      .expect((res) => {
        expect(res.body.error?.code).toBe("SIGNAL_BLOCKED");
      });

    await app.close();
  });

  it("report persists; duplicate block is idempotent", async () => {
    const clock = new FakeClock(new Date("2026-08-18T15:10:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), skipHydrate: true });
    const server = app.getHttpServer();
    await seedEligiblePair(server);

    const reported = await request(server)
      .post("/safety/report")
      .set("x-user-id", "a")
      .send({ userId: "b", category: "HARASSMENT" })
      .expect(201);
    expect(reported.body.report?.id).toMatch(/^rpt_/);
    expect(reported.body.report?.category).toBe("HARASSMENT");
    expect(engine.reports).toHaveLength(1);
    expect(engine.reports[0]?.reportedId).toBe("b");

    const first = await request(server).post("/safety/block").set("x-user-id", "a").send({ userId: "b" }).expect(201);
    const second = await request(server).post("/safety/block").set("x-user-id", "a").send({ userId: "b" }).expect(201);
    expect(second.body.block?.id).toBe(first.body.block?.id);
    expect(engine.blocks.filter((b) => b.blockerId === "a" && b.blockedId === "b")).toHaveLength(1);
    expect(engine.reports).toHaveLength(1);

    await app.close();
  });

  it("third party gets 404 on connection, media, and chat", async () => {
    const clock = new FakeClock(new Date("2026-08-18T15:20:00.000Z"));
    const media = new MemoryMediaStore();
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      media,
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await seedEligiblePair(server);
    const { connectionId } = await openConnection(server);
    const mediaId = await uploadSelfieMedia(server, connectionId, "a");

    await request(server).get(`/connections/${connectionId}`).set("x-user-id", "stranger").expect(404);
    await request(server).get(`/connections/${connectionId}/messages`).set("x-user-id", "stranger").expect(404);
    await request(server)
      .post(`/connections/${connectionId}/messages`)
      .set("x-user-id", "stranger")
      .send({ text: "hello" })
      .expect(404);
    await request(server)
      .get(`/connections/${connectionId}/media/${mediaId}`)
      .set("x-user-id", "stranger")
      .expect(404);

    await request(server).post("/safety/block").set("x-user-id", "a").send({ userId: "b" }).expect(201);

    await request(server).get(`/connections/${connectionId}`).set("x-user-id", "stranger").expect(404);
    await request(server).get(`/connections/${connectionId}/messages`).set("x-user-id", "stranger").expect(404);
    await request(server)
      .post(`/connections/${connectionId}/messages`)
      .set("x-user-id", "b")
      .send({ text: "still chatting?" })
      .expect(403);

    await app.close();
  });
});
