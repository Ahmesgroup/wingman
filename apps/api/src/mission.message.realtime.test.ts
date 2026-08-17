import { describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import type { RealtimeEnvelope } from "@wingman/realtime";
import { createNestApp } from "./testing/create-nest-app.js";

function waitForEvent(socket: Socket, type: string, timeoutMs = 4000): Promise<RealtimeEnvelope> {
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

describe("mission.message realtime", () => {
  it(
    "delivers chat to peer without HTTP polling and lists on reconnect",
    async () => {
      const clock = new FakeClock(new Date("2026-08-17T12:00:00.000Z"));
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

      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);

      const sig = await request(server).post("/signals").set("x-user-id", "a").send({ receiverId: "b" }).expect(201);
      const signalId = sig.body.signal.id;
      await request(server).post(`/signals/${signalId}/open`).set("x-user-id", "b").expect(201);
      const accept = await request(server).post(`/signals/${signalId}/accept`).set("x-user-id", "b").expect(201);
      const connectionId = accept.body.connection.id;
      await request(server).post("/dev/seed").send({ id: "c", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);

      // Connection metadata and chat are private to the two participants.
      await request(server).get(`/connections/${connectionId}`).set("x-user-id", "c").expect(404);
      await request(server).get(`/connections/${connectionId}/messages`).set("x-user-id", "c").expect(404);

      const { uploadSelfieMedia } = await import("./testing/selfie-media.js");
      const mediaA = await uploadSelfieMedia(server, connectionId, "a");
      const mediaB = await uploadSelfieMedia(server, connectionId, "b");
      await request(server).post(`/connections/${connectionId}/selfie`).set("x-user-id", "a").send({ mediaId: mediaA }).expect(201);
      await request(server).post(`/connections/${connectionId}/selfie`).set("x-user-id", "b").send({ mediaId: mediaB }).expect(201);
      await request(server).post(`/connections/${connectionId}/approve`).set("x-user-id", "a").expect(201);
      await request(server).post(`/connections/${connectionId}/meet-now`).set("x-user-id", "a").expect(201);

      const sockB = await connectSocket(port, "b");
      await new Promise((r) => sockB.emit("subscribe", { connectionId, missionId: connectionId }, r));
      const pending = waitForEvent(sockB, "mission.message");

      await request(server)
        .post(`/connections/${connectionId}/messages`)
        .set("x-user-id", "a")
        .send({ text: "terrace side" })
        .expect(201);

      const ev = await pending;
      expect(ev.payload.text).toBe("terrace side");
      expect(ev.payload.senderId).toBe("a");

      const listed = await request(server).get(`/connections/${connectionId}/messages`).set("x-user-id", "b").expect(200);
      expect(listed.body.messages.length).toBeGreaterThanOrEqual(1);
      expect(listed.body.messages[0].text).toBe("terrace side");

      sockB.close();
      await app.close();
    },
    25_000,
  );
});
