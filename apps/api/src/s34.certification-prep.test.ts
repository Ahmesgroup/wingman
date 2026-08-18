/**
 * S34 certification prep — ticket remainingMs, own-outcome, anti-contact payload.
 * Does not rewrite engines. Does not invent Plus checkout.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { entitlementsFor, FakeClock, WINDOWS_MS, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryMediaStore } from "@wingman/media";
import { createNestApp } from "./testing/create-nest-app.js";
import { uploadSelfieMedia } from "./testing/selfie-media.js";

async function seedPair(server: import("http").Server) {
  await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
  await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
  await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
  await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8567, lng: 2.3523 }).expect(201);
}

async function mutuallyValidated(server: import("http").Server, key: string) {
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
  const connectionId = accept.body.connection.id as string;
  const mediaA = await uploadSelfieMedia(server, connectionId, "a");
  const mediaB = await uploadSelfieMedia(server, connectionId, "b");
  await request(server).post(`/connections/${connectionId}/selfie`).set("x-user-id", "a").send({ mediaId: mediaA }).expect(201);
  await request(server).post(`/connections/${connectionId}/selfie`).set("x-user-id", "b").send({ mediaId: mediaB }).expect(201);
  await request(server).post(`/connections/${connectionId}/approve`).set("x-user-id", "a").expect(201);
  return connectionId;
}

describe("S34 certification prep wiring", () => {
  it("FREE hold_ticket remainingMs is 2h from the server clock", async () => {
    const clock = new FakeClock(new Date("2026-08-18T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      media: new MemoryMediaStore(),
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await seedPair(server);
    const ents = await request(server).get("/billing/entitlements").set("x-user-id", "a").expect(200);
    expect(ents.body.plan).toBe("FREE");
    expect(ents.body.payments?.paymentsEnabled ?? false).toBe(false);

    const connectionId = await mutuallyValidated(server, "s34-free-ticket");
    const held = await request(server).post(`/connections/${connectionId}/ticket`).set("x-user-id", "a").expect(201);
    expect(held.body.connection.state).toBe("TICKET_ACTIVE");

    const got = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(got.body.serverTime).toBeTruthy();
    expect(got.body.remainingMs).toBe(WINDOWS_MS.TICKET_FREE);
    const expires = Date.parse(got.body.connection.expiresAt);
    expect(expires - clock.now().getTime()).toBe(WINDOWS_MS.TICKET_FREE);

    await request(server)
      .post("/billing/checkout")
      .set("x-user-id", "a")
      .send({ successUrl: "https://example.com/ok", cancelUrl: "https://example.com/cancel" })
      .expect(503);

    await app.close();
  });

  it("Wingman+ ticket remainingMs is 24h when billing entitlements say Plus (no checkout)", async () => {
    const clock = new FakeClock(new Date("2026-08-18T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.setEntitlementsForUser(() => entitlementsFor(true));
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      media: new MemoryMediaStore(),
      skipHydrate: true,
    });
    // Billing onModuleInit may overwrite the adapter — restore Plus duration authority for this wire check.
    engine.setEntitlementsForUser(() => entitlementsFor(true));
    const server = app.getHttpServer();
    await seedPair(server);
    const connectionId = await mutuallyValidated(server, "s34-plus-ticket");
    await request(server).post(`/connections/${connectionId}/ticket`).set("x-user-id", "a").expect(201);
    const got = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(got.body.remainingMs).toBe(WINDOWS_MS.TICKET_PLUS);
    await app.close();
  });

  it("each party records own outcome; cooldown expiresAt is server-side after both", async () => {
    const clock = new FakeClock(new Date("2026-08-18T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      media: new MemoryMediaStore(),
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await seedPair(server);
    const connectionId = await mutuallyValidated(server, "s34-outcome");
    await request(server).post(`/connections/${connectionId}/meet-now`).set("x-user-id", "a").expect(201);
    await request(server).post(`/connections/${connectionId}/lets-meet`).set("x-user-id", "a").expect(201);
    await request(server).post(`/connections/${connectionId}/finish`).set("x-user-id", "a").expect(201);

    const one = await request(server)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", "a")
      .send({ outcome: "YES" })
      .expect(201);
    expect(one.body.connection.state).toBe("OUTCOME_PENDING");
    expect(one.body.connection.initiatorOutcome).toBe("YES");
    expect(one.body.connection.recipientOutcome === "PENDING" || !one.body.connection.recipientOutcome).toBe(true);

    const both = await request(server)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", "b")
      .send({ outcome: "NO" })
      .expect(201);
    expect(both.body.connection.state).toBe("COOLDOWN_ACTIVE");
    const got = await request(server).get(`/connections/${connectionId}`).set("x-user-id", "b").expect(200);
    expect(got.body.connection.state).toBe("COOLDOWN_ACTIVE");
    expect(got.body.remainingMs).toBe(WINDOWS_MS.COOLDOWN_YES);
    await app.close();
  });

  it("anti-contact returns filtered without leaking [filtered] on GET messages", async () => {
    const clock = new FakeClock(new Date("2026-08-18T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      media: new MemoryMediaStore(),
      skipHydrate: true,
    });
    const server = app.getHttpServer();
    await seedPair(server);
    const connectionId = await mutuallyValidated(server, "s34-chat");
    await request(server).post(`/connections/${connectionId}/meet-now`).set("x-user-id", "a").expect(201);

    const blocked = await request(server)
      .post(`/connections/${connectionId}/messages`)
      .set("x-user-id", "a")
      .send({ text: "instagram @wingman_test whatsapp" })
      .expect(201);
    expect(blocked.body.message.filtered).toBe(true);

    const list = await request(server).get(`/connections/${connectionId}/messages`).set("x-user-id", "b").expect(200);
    expect(list.body.messages.some((m: { filtered?: boolean }) => m.filtered)).toBe(true);
    expect(JSON.stringify(list.body.messages)).not.toMatch(/\[filtered\]/);
    await app.close();
  });
});
