import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryProtocolRepository } from "@wingman/persistence";
import { ConsoleSmsProvider } from "@wingman/providers";
import { createNestApp } from "./testing/create-nest-app.js";

describe("S15 persistence + providers integration", () => {
  it("mirrors protocol artifacts after HTTP mutations", async () => {
    const clock = new FakeClock(new Date("2026-08-09T01:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const protocolRepo = new MemoryProtocolRepository();
    const sms = new ConsoleSmsProvider();
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      protocolRepo,
      sms,
    });
    const server = app.getHttpServer();

    await request(server)
      .post("/dev/seed")
      .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] })
      .expect(201);
    await request(server)
      .post("/dev/seed")
      .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] })
      .expect(201);

    expect(protocolRepo.users.size).toBe(2);

    await request(server)
      .post("/radar/activate")
      .set("x-user-id", "a")
      .send({ lat: 48.8566, lng: 2.3522 })
      .expect(201);
    expect(protocolRepo.presence.has("a")).toBe(true);

    const signalRes = await request(server)
      .post("/signals")
      .set("x-user-id", "a")
      .set("idempotency-key", "persist-1")
      .send({ receiverId: "b" })
      .expect(201);
    const signalId = signalRes.body.signal.id;
    expect((await protocolRepo.getSignal(signalId))?.status).toBe("PENDING");

    const accept = await request(server)
      .post(`/signals/${signalId}/accept`)
      .set("x-user-id", "b")
      .expect(201);
    const connectionId = accept.body.connection.id;
    expect((await protocolRepo.getConnection(connectionId))?.state).toBe(
      "WAITING_FOR_INITIATOR_SELFIE",
    );

    const ready = await request(server).get("/internal/ready").expect(200);
    expect(ready.body.ready).toBe(true);
    expect(ready.body.checks.persistence.ok).toBe(true);

    const metrics = await request(server).get("/internal/metrics").expect(200);
    expect(metrics.body.persistence.name).toBe("memory");
    expect(metrics.body.persistence.signals).toBeGreaterThanOrEqual(1);

    process.env.AUTH_DEBUG_OTP = "true";
    const otp = await request(server)
      .post("/auth/otp/request")
      .send({ phoneE164: "+33611112222" })
      .expect(201);
    expect(otp.body.challengeId).toBeTruthy();
    expect(sms.sent).toHaveLength(1);

    await app.close();
  });
});
