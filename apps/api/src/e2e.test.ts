import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine, WINDOWS_MS } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { createNestApp } from "./testing/create-nest-app.js";

describe("Nest API e2e protocol", () => {
  it("completes loop over HTTP without frontend", async () => {
    const clock = new FakeClock(new Date("2026-08-08T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore() });
    const server = app.getHttpServer();

    await request(server)
      .post("/dev/seed")
      .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] })
      .expect(201);
    await request(server)
      .post("/dev/seed")
      .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] })
      .expect(201);

    await request(server)
      .post("/radar/activate")
      .set("x-user-id", "a")
      .send({ lat: 48.8566, lng: 2.3522 })
      .expect(201);
    await request(server)
      .post("/radar/activate")
      .set("x-user-id", "b")
      .send({ lat: 48.8567, lng: 2.3523 })
      .expect(201);

    const candidates = await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200);
    expect(candidates.body.candidates[0].userId).toBe("b");
    expect(candidates.body.candidates[0].lat).toBeUndefined();

    const signalRes = await request(server)
      .post("/signals")
      .set("x-user-id", "a")
      .set("idempotency-key", "k1")
      .send({ receiverId: "b" })
      .expect(201);
    const signalId = signalRes.body.signal.id;

    await request(server).post(`/signals/${signalId}/open`).set("x-user-id", "b").expect(201);
    const accept = await request(server).post(`/signals/${signalId}/accept`).set("x-user-id", "b").expect(201);
    const connectionId = accept.body.connection.id;

    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "a")
      .send({ mediaId: "ma" })
      .expect(201);
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "b")
      .send({ mediaId: "mb" })
      .expect(201);
    await request(server).post(`/connections/${connectionId}/approve`).set("x-user-id", "a").expect(201);
    await request(server).post(`/connections/${connectionId}/meet-now`).set("x-user-id", "a").expect(201);
    await request(server).post(`/connections/${connectionId}/lets-meet`).set("x-user-id", "a").expect(201);

    clock.advanceMs(WINDOWS_MS.MISSION_FREE + 1);
    await request(server).post("/internal/reconcile").expect(201);

    let conn = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("OUTCOME_PENDING");

    await request(server)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", "a")
      .send({ outcome: "YES" })
      .expect(201);
    await request(server)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", "b")
      .send({ outcome: "YES" })
      .expect(201);

    conn = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("COOLDOWN_ACTIVE");

    clock.advanceMs(WINDOWS_MS.COOLDOWN_YES + 1);
    await request(server).post("/internal/reconcile").expect(201);
    conn = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("COMPLETED");

    const metrics = await request(server).get("/internal/metrics").expect(200);
    expect(metrics.body.destinyEnabled).toBe(false);
    expect(metrics.body.locks).toBe(0);

    const ready = await request(server).get("/internal/ready").expect(200);
    expect(ready.body.ready).toBe(true);

    await app.close();
  });
});
