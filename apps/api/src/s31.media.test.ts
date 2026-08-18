import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryMediaStore } from "@wingman/media";
import { setInfraOverrides } from "./modules/infra/infra.module.js";
import { createNestApp } from "./testing/create-nest-app.js";

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const CLOCK_ISO = "2026-08-18T16:00:00.000Z";

async function seedUser(
  server: import("http").Server,
  id: string,
  gender: "MALE" | "FEMALE",
  interestedIn: Array<"MEN" | "WOMEN">,
) {
  await request(server).post("/dev/seed").send({ id, gender, interestedIn }).expect(201);
}

async function seedPair(
  server: import("http").Server,
  a = "a",
  b = "b",
  key = "s31-k1",
  loc = { lat: 48.8566, lng: 2.3522 },
) {
  await seedUser(server, a, "MALE", ["WOMEN"]);
  await seedUser(server, b, "FEMALE", ["MEN"]);
  await request(server).post("/radar/activate").set("x-user-id", a).send(loc).expect(201);
  await request(server)
    .post("/radar/activate")
    .set("x-user-id", b)
    .send({ lat: loc.lat + 0.0001, lng: loc.lng + 0.0001 })
    .expect(201);
  const signalRes = await request(server)
    .post("/signals")
    .set("x-user-id", a)
    .set("idempotency-key", key)
    .send({ receiverId: b })
    .expect(201);
  await request(server).post(`/signals/${signalRes.body.signal.id}/open`).set("x-user-id", b).expect(201);
  const accept = await request(server)
    .post(`/signals/${signalRes.body.signal.id}/accept`)
    .set("x-user-id", b)
    .expect(201);
  return accept.body.connection.id as string;
}

function upload(
  server: import("http").Server,
  connectionId: string,
  userId: string,
  filename = "selfie.jpg",
) {
  return request(server)
    .post(`/connections/${connectionId}/media`)
    .set("x-user-id", userId)
    .attach("file", TINY_JPEG, { filename, contentType: "image/jpeg" });
}

describe("S31 private selfie media", () => {
  afterEach(() => {
    setInfraOverrides({});
  });

  it("uploads privately, binds opaque id, authorizes peer GET only after bind, purges on expire", async () => {
    const clock = new FakeClock(new Date(CLOCK_ISO));
    const media = new MemoryMediaStore();
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), media });
    const server = app.getHttpServer();
    const connectionId = await seedPair(server);

    const upA = await upload(server, connectionId, "a").expect(201);
    expect(upA.body.mediaId).toMatch(/^m_/);
    expect(upA.body.capturedAt).toBe(CLOCK_ISO);
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

    const upB = await upload(server, connectionId, "b", "b.jpg").expect(201);
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "b")
      .send({ mediaId: upB.body.mediaId })
      .expect(201);

    const bound = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(bound.body.connection.initiatorSelfieMediaId).toBe(upA.body.mediaId);
    expect(bound.body.connection.recipientSelfieMediaId).toBe(upB.body.mediaId);

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

  it("refuses unauthenticated, wrong-connection, expired, and third-party access", async () => {
    const clock = new FakeClock(new Date(CLOCK_ISO));
    const media = new MemoryMediaStore();
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore(), media });
    const server = app.getHttpServer();
    const ab = await seedPair(server, "a", "b", "s31-ab");
    const cd = await seedPair(server, "c", "d", "s31-cd", { lat: 48.86, lng: 2.36 });

    const upA = await upload(server, ab, "a").expect(201);
    const upC = await upload(server, cd, "c").expect(201);

    await request(server).get(`/connections/${ab}/media/${upA.body.mediaId}`).expect(401);
    await request(server).post(`/connections/${ab}/media`).expect(401);
    await request(server).post(`/connections/${ab}/selfie`).send({ mediaId: upA.body.mediaId }).expect(401);

    // A cannot retrieve C's selfie (wrong connection + not a participant)
    await request(server)
      .get(`/connections/${cd}/media/${upC.body.mediaId}`)
      .set("x-user-id", "a")
      .expect(404);
    await request(server)
      .get(`/connections/${ab}/media/${upC.body.mediaId}`)
      .set("x-user-id", "a")
      .expect(404);
    await request(server)
      .get(`/connections/${ab}/media/${upC.body.mediaId}`)
      .set("x-user-id", "b")
      .expect(404);

    // Bind A's media onto C-D is refused
    await request(server)
      .post(`/connections/${cd}/selfie`)
      .set("x-user-id", "c")
      .send({ mediaId: upA.body.mediaId })
      .expect(404);
    await request(server)
      .post(`/connections/${cd}/selfie`)
      .set("x-user-id", "a")
      .send({ mediaId: upA.body.mediaId })
      .expect(404);

    // Extra unbound upload by A — B still cannot fetch it
    const extraA = await upload(server, ab, "a", "a2.jpg").expect(201);
    await request(server)
      .get(`/connections/${ab}/media/${extraA.body.mediaId}`)
      .set("x-user-id", "b")
      .expect(404);

    const expiresAt = new Date(clock.now().getTime() + 1_000);
    const staleGet = await media.put({
      connectionId: ab,
      uploaderId: "a",
      contentType: "image/jpeg",
      body: TINY_JPEG,
      createdAt: clock.now(),
      expiresAt,
    });
    const staleBind = await media.put({
      connectionId: ab,
      uploaderId: "a",
      contentType: "image/jpeg",
      body: TINY_JPEG,
      createdAt: clock.now(),
      expiresAt,
    });
    clock.advanceMs(2_000);
    await request(server)
      .post(`/connections/${ab}/selfie`)
      .set("x-user-id", "a")
      .send({ mediaId: staleBind.mediaId })
      .expect(404);
    await request(server)
      .get(`/connections/${ab}/media/${staleGet.mediaId}`)
      .set("x-user-id", "a")
      .expect(404);

    await app.close();
  });
});
