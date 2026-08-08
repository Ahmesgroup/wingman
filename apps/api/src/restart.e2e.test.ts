import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { hydrateFromRepository, MemoryProtocolRepository } from "@wingman/persistence";
import { createNestApp } from "./testing/create-nest-app.js";

describe("S16 restart gate", () => {
  it("API restart via hydrate keeps connection state and drops presence", async () => {
    const clock = new FakeClock(new Date("2026-08-09T03:00:00.000Z"));
    const repo = new MemoryProtocolRepository();
    const engine1 = new WingmanEngine({ clock });
    const app1 = await createNestApp({
      engine: engine1,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo: repo,
      skipHydrate: true,
    });
    const server1 = app1.getHttpServer();

    await request(server1)
      .post("/dev/seed")
      .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] })
      .expect(201);
    await request(server1)
      .post("/dev/seed")
      .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] })
      .expect(201);
    await request(server1)
      .post("/radar/activate")
      .set("x-user-id", "a")
      .send({ lat: 48.85, lng: 2.35 })
      .expect(201);
    await request(server1)
      .post("/radar/activate")
      .set("x-user-id", "b")
      .send({ lat: 48.8501, lng: 2.3501 })
      .expect(201);
    const signalRes = await request(server1)
      .post("/signals")
      .set("x-user-id", "a")
      .send({ receiverId: "b" })
      .expect(201);
    const signalId = signalRes.body.signal.id;
    const accept = await request(server1)
      .post(`/signals/${signalId}/accept`)
      .set("x-user-id", "b")
      .expect(201);
    const connectionId = accept.body.connection.id;
    await app1.close();

    // Simulate new process: fresh engine + hydrate from durable repo
    const engine2 = new WingmanEngine({ clock });
    const report = await hydrateFromRepository(engine2, repo);
    expect(report.presenceRestored).toBe(0);
    expect(engine2.presence.size).toBe(0);
    expect(engine2.connections.get(connectionId)?.state).toBe("WAITING_FOR_INITIATOR_SELFIE");

    const app2 = await createNestApp({
      engine: engine2,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo: repo,
      skipHydrate: true,
    });
    const server2 = app2.getHttpServer();
    const conn = await request(server2).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("WAITING_FOR_INITIATOR_SELFIE");

    // Presence must be re-established after restart
    await request(server2).get("/radar/candidates").set("x-user-id", "a").expect(404);
    await request(server2)
      .post("/radar/activate")
      .set("x-user-id", "a")
      .send({ lat: 48.85, lng: 2.35 })
      .expect(201);

    await app2.close();
  });
});
