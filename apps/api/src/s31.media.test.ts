import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryMediaStore } from "@wingman/media";
import { setInfraOverrides } from "./modules/infra/infra.module.js";
import { createNestApp } from "./testing/create-nest-app.js";

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

async function seedPair(server: import("http").Server) {
  await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
  await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
  await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
  await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
  const signalRes = await request(server)
    .post("/signals")
    .set("x-user-id", "a")
    .set("idempotency-key", "s31-k1")
    .send({ receiverId: "b" })
    .expect(201);
  await request(server).post(`/signals/${signalRes.body.signal.id}/open`).set("x-user-id", "b").expect(201);
  const accept = await request(server)
    .post(`/signals/${signalRes.body.signal.id}/accept`)
    .set("x-user-id", "b")
    .expect(201);
  return accept.body.connection.id as string;
}

describe("S31 private selfie media", () => {
  afterEach(() => {
    setInfraOverrides({});
  });

  it("uploads privately, binds opaque id, authorizes peer GET only after bind, purges on expire", async () => {
    const clock = new FakeClock(new Date("2026-08-17T10:00:00.000Z"));
    const media = new MemoryMediaStore();
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), media });
    const server = app.getHttpServer();
    const connectionId = await seedPair(server);

    const upA = await request(server)
      .post(`/connections/${connectionId}/media`)
      .set("x-user-id", "a")
      .attach("file", TINY_JPEG, { filename: "a.jpg", contentType: "image/jpeg" })
      .expect(201);
    expect(upA.body.mediaId).toMatch(/^m_/);
    expect(JSON.stringify(upA.body)).not.toMatch(/https?:\/\//);

    // Stranger cannot fetch
    await request(server)
      .get(`/connections/${connectionId}/media/${upA.body.mediaId}`)
      .set("x-user-id", "stranger")
      .expect(404);

    // Peer cannot fetch until bound on connection
    await request(server)
      .get(`/connections/${connectionId}/media/${upA.body.mediaId}`)
      .set("x-user-id", "b")
      .expect(404);

    // Uploader preview OK
    await request(server)
      .get(`/connections/${connectionId}/media/${upA.body.mediaId}`)
      .set("x-user-id", "a")
      .expect(200)
      .expect("Cache-Control", /no-store/);

    // Fake opaque id rejected
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "a")
      .send({ mediaId: "m_forged" })
      .expect(404);

    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "a")
      .send({ mediaId: upA.body.mediaId })
      .expect(201);

    // Peer can now stream
    const peerGet = await request(server)
      .get(`/connections/${connectionId}/media/${upA.body.mediaId}`)
      .set("x-user-id", "b")
      .expect(200);
    expect(peerGet.headers["content-type"]).toMatch(/image\/jpeg/);

    const upB = await request(server)
      .post(`/connections/${connectionId}/media`)
      .set("x-user-id", "b")
      .attach("file", TINY_JPEG, { filename: "b.jpg", contentType: "image/jpeg" })
      .expect(201);
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "b")
      .send({ mediaId: upB.body.mediaId })
      .expect(201);

    // Expire connection → purge
    clock.advanceMs(6 * 60 * 1000);
    await request(server).post("/internal/reconcile").expect(201);
    expect(await media.getMeta(upA.body.mediaId)).toBeNull();
    expect(await media.getMeta(upB.body.mediaId)).toBeNull();

    const ready = await request(server).get("/internal/ready").expect(200);
    expect(ready.body.checks.media.ok).toBe(true);
    expect(ready.body.checks.media.detail).toBe("memory");

    await app.close();
  });
});
