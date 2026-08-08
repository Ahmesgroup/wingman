import { describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import type { RealtimeEnvelope } from "@wingman/realtime";
import { createNestApp } from "./testing/create-nest-app.js";

function waitForEvent(socket: Socket, type: string, timeoutMs = 3000): Promise<RealtimeEnvelope> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const handler = (env: RealtimeEnvelope) => {
      if (env.type === type) {
        clearTimeout(t);
        socket.off("event", handler);
        resolve(env);
      }
    };
    socket.on("event", handler);
  });
}

function connectSocket(port: number, userId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      path: "/ws",
      transports: ["websocket"],
      auth: { userId },
      forceNew: true,
    });
    socket.on("ready", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("socket connect timeout")), 4000);
  });
}

describe("S17 WebSocket multi-client gate", () => {
  it("delivers signal.received and match.created without polling; rejects unauthenticated", async () => {
    const clock = new FakeClock(new Date("2026-08-09T04:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      skipHydrate: true,
    });
    await app.listen(0);
    const server = app.getHttpServer();
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const rejected = io(`http://127.0.0.1:${port}`, {
      path: "/ws",
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve) => {
      rejected.on("disconnect", () => resolve());
      rejected.on("connect_error", () => resolve());
      setTimeout(() => resolve(), 1500);
    });
    expect(rejected.connected).toBe(false);
    rejected.close();

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
      .send({ lat: 48.85, lng: 2.35 })
      .expect(201);
    await request(server)
      .post("/radar/activate")
      .set("x-user-id", "b")
      .send({ lat: 48.8501, lng: 2.3501 })
      .expect(201);

    const sockB = await connectSocket(port, "b");
    const sockA = await connectSocket(port, "a");
    const pendingSignal = waitForEvent(sockB, "signal.received");

    const signalRes = await request(server)
      .post("/signals")
      .set("x-user-id", "a")
      .send({ receiverId: "b" })
      .expect(201);
    const signalId = signalRes.body.signal.id;
    const signalEv = await pendingSignal;
    expect(signalEv.aggregateId).toBe(signalId);
    expect(signalEv.version).toBe(1);
    expect(signalEv.eventId).toBeTruthy();

    const pendingMatchA = waitForEvent(sockA, "match.created");
    const pendingMatchB = waitForEvent(sockB, "match.created");
    const accept = await request(server)
      .post(`/signals/${signalId}/accept`)
      .set("x-user-id", "b")
      .expect(201);
    const connectionId = accept.body.connection.id;
    const [matchA, matchB] = await Promise.all([pendingMatchA, pendingMatchB]);
    expect(matchA.aggregateId).toBe(connectionId);
    expect(matchB.aggregateId).toBe(connectionId);

    const sub = await new Promise<{ ok: boolean }>((resolve) => {
      sockA.emit("subscribe", { connectionId }, (ack: { ok: boolean }) => resolve(ack));
    });
    expect(sub.ok).toBe(true);

    // Resume after "reconnect": no duplicate of already-seen match when lastEventId is current
    const resume = await new Promise<{ ok: boolean; replayed: number }>((resolve) => {
      sockA.emit("resume", { lastEventId: matchA.eventId }, (ack: { ok: boolean; replayed: number }) =>
        resolve(ack),
      );
    });
    expect(resume.ok).toBe(true);
    expect(resume.replayed).toBe(0);

    // Blocked user cannot subscribe to the pair connection after block
    await request(server).post("/safety/block").set("x-user-id", "a").send({ userId: "b" }).expect(201);
    const forbidden = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      sockB.emit("subscribe", { connectionId }, (ack: { ok: boolean; code?: string }) => resolve(ack));
    });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.code).toBe("FORBIDDEN");

    sockA.close();
    sockB.close();
    await app.close();
  });

  it("two devices of same user both receive private events", async () => {
    const clock = new FakeClock(new Date("2026-08-09T04:10:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = await createNestApp({
      engine,
      ephemeral: new MemoryEphemeralStore(),
      skipHydrate: true,
    });
    await app.listen(0);
    const server = app.getHttpServer();
    const port = (server.address() as { port: number }).port;

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
      .send({ lat: 1, lng: 1 })
      .expect(201);
    await request(server)
      .post("/radar/activate")
      .set("x-user-id", "b")
      .send({ lat: 1.0001, lng: 1.0001 })
      .expect(201);

    const device1 = await connectSocket(port, "b");
    const device2 = await connectSocket(port, "b");
    const p1 = waitForEvent(device1, "signal.received");
    const p2 = waitForEvent(device2, "signal.received");
    await request(server).post("/signals").set("x-user-id", "a").send({ receiverId: "b" }).expect(201);
    const [e1, e2] = await Promise.all([p1, p2]);
    expect(e1.eventId).toBe(e2.eventId);

    device1.close();
    device2.close();
    await app.close();
  });
});
