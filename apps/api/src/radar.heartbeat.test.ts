import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine, WINDOWS_MS } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { createNestApp } from "./testing/create-nest-app.js";

describe("radar heartbeat TTL", () => {
  it("POST /radar/heartbeat extends presence so candidates remain after original TTL", async () => {
    const clock = new FakeClock(new Date("2026-08-18T10:00:00.000Z"));
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

    const first = await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200);
    expect(first.body.candidates[0].userId).toBe("b");
    expect(first.body.candidates[0].lat).toBeUndefined();

    clock.advanceMs(WINDOWS_MS.PRESENCE_TTL - 1_000);
    const beatA = await request(server)
      .post("/radar/heartbeat")
      .set("x-user-id", "a")
      .send({ lat: 48.8566, lng: 2.3522 })
      .expect(201);
    const beatB = await request(server)
      .post("/radar/heartbeat")
      .set("x-user-id", "b")
      .send({ lat: 48.8567, lng: 2.3523 })
      .expect(201);
    expect(beatA.body.presence.expiresAt).toBeTruthy();
    expect(beatB.body.presence.expiresAt).toBeTruthy();

    clock.advanceMs(2_000);
    const still = await request(server).get("/radar/candidates").set("x-user-id", "a").expect(200);
    expect(still.body.candidates.map((c: { userId: string }) => c.userId)).toEqual(["b"]);
    expect(JSON.stringify(still.body)).not.toMatch(/48\.8567/);

    await app.close();
  });
});
