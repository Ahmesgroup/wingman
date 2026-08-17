/**
 * Client loop smoke — mirrors prototype dual-user path (proto-alex / proto-peer).
 * Radar → Signal → Connection → Mission → Outcome → Cooldown.
 * Payments remain disabled. No domain package changes.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { createNestApp } from "./testing/create-nest-app.js";

const ME = "proto-alex";
const PEER = "proto-peer";

describe("client loop smoke (prototype path)", () => {
  it("Radar → Signal → Connection → Mission → Outcome → Cooldown", async () => {
    const clock = new FakeClock(new Date("2026-08-12T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({ engine, ephemeral: new MemoryEphemeralStore() });
    const server = app.getHttpServer();

    await request(server)
      .post("/dev/seed")
      .send({ id: ME, gender: "MALE", interestedIn: ["WOMEN"] })
      .expect(201);
    await request(server)
      .post("/dev/seed")
      .send({ id: PEER, gender: "FEMALE", interestedIn: ["MEN"] })
      .expect(201);

    await request(server)
      .post("/radar/activate")
      .set("x-user-id", ME)
      .send({ lat: 49.6116, lng: 6.1319, visibility: "ACTIVE" })
      .expect(201);
    await request(server)
      .post("/radar/activate")
      .set("x-user-id", PEER)
      .send({ lat: 49.6117, lng: 6.132, visibility: "ACTIVE" })
      .expect(201);

    const ents = await request(server).get("/billing/entitlements").set("x-user-id", ME).expect(200);
    expect(ents.body.plan).toBe("FREE");
    expect(ents.body.payments?.paymentsEnabled ?? false).toBe(false);

    const signalRes = await request(server)
      .post("/signals")
      .set("x-user-id", ME)
      .set("idempotency-key", "client-smoke-1")
      .send({ receiverId: PEER, source: "RADAR" })
      .expect(201);
    const signalId = signalRes.body.signal.id as string;

    await request(server).post(`/signals/${signalId}/open`).set("x-user-id", PEER).expect(201);
    const accept = await request(server).post(`/signals/${signalId}/accept`).set("x-user-id", PEER).expect(201);
    const connectionId = accept.body.connection.id as string;
    expect(accept.body.connection.state).toBe("WAITING_FOR_INITIATOR_SELFIE");

    const { uploadSelfieMedia } = await import("./testing/selfie-media.js");
    const mediaMe = await uploadSelfieMedia(server, connectionId, ME);
    const mediaPeer = await uploadSelfieMedia(server, connectionId, PEER);
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", ME)
      .send({ mediaId: mediaMe })
      .expect(201);
    await request(server)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", PEER)
      .send({ mediaId: mediaPeer })
      .expect(201);
    await request(server).post(`/connections/${connectionId}/approve`).set("x-user-id", ME).expect(201);

    const meet = await request(server)
      .post(`/connections/${connectionId}/meet-now`)
      .set("x-user-id", ME)
      .expect(201);
    expect(meet.body.connection.state).toBe("MISSION_MEET_ACTIVE");

    const msg = await request(server)
      .post(`/connections/${connectionId}/messages`)
      .set("x-user-id", ME)
      .send({ text: "Terrace side sounds good" })
      .expect(201);
    expect(msg.body.message.filtered).toBeFalsy();

    const blocked = await request(server)
      .post(`/connections/${connectionId}/messages`)
      .set("x-user-id", ME)
      .send({ text: "call me +352 621 000 000" })
      .expect(201);
    expect(blocked.body.message.filtered).toBe(true);

    const lets = await request(server)
      .post(`/connections/${connectionId}/lets-meet`)
      .set("x-user-id", ME)
      .expect(201);
    expect(lets.body.connection.state).toBe("MISSION_CONFIRMED");

    const finished = await request(server)
      .post(`/connections/${connectionId}/finish`)
      .set("x-user-id", ME)
      .expect(201);
    expect(finished.body.connection.state).toBe("OUTCOME_PENDING");

    await request(server)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", ME)
      .send({ outcome: "YES" })
      .expect(201);
    await request(server)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", PEER)
      .send({ outcome: "YES" })
      .expect(201);

    const cool = await request(server).get(`/connections/${connectionId}`).set("x-user-id", ME).expect(200);
    expect(cool.body.connection.state).toBe("COOLDOWN_ACTIVE");

    await request(server)
      .post("/billing/checkout")
      .set("x-user-id", ME)
      .send({ successUrl: "https://example.com/ok", cancelUrl: "https://example.com/cancel" })
      .expect(503);

    await app.close();
  });
});
