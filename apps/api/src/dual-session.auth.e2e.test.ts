import { afterEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { AuthService } from "@wingman/auth";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryMediaStore } from "@wingman/media";
import type { RealtimeEnvelope } from "@wingman/realtime";
import { createNestApp } from "./testing/create-nest-app.js";

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const priorEnv = {
  AUTH_DEBUG_OTP: process.env.AUTH_DEBUG_OTP,
  AUTH_FIELD_TEST_MODE: process.env.AUTH_FIELD_TEST_MODE,
  AUTH_ALLOW_DEV: process.env.AUTH_ALLOW_DEV,
  OTP_PROVIDER: process.env.OTP_PROVIDER,
};

function authHeaders(session: { accessToken: string }, deviceId: string) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    "x-device-id": deviceId,
  };
}

function waitForEvent(socket: Socket, type: string): Promise<RealtimeEnvelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 4_000);
    const handler = (event: RealtimeEnvelope) => {
      if (event.type !== type) return;
      clearTimeout(timer);
      socket.off("event", handler);
      resolve(event);
    };
    socket.on("event", handler);
  });
}

function connectSessionSocket(port: number, session: { accessToken: string }, deviceId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      path: "/ws",
      transports: ["websocket"],
      auth: { token: session.accessToken, deviceId },
      forceNew: true,
    });
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 4_000);
    socket.on("ready", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", reject);
  });
}

describe("two-session test-harness protocol", () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it(
    "uses test-only OTP sessions through radar, private selfie, live mission chat, outcome and cooldown",
    async () => {
      // AUTH_DEBUG_OTP is accepted only while NODE_ENV=test (see AuthService).
      process.env.AUTH_DEBUG_OTP = "true";
      process.env.AUTH_FIELD_TEST_MODE = "false";
      process.env.OTP_PROVIDER = "local";

      const clock = new FakeClock(new Date("2026-08-17T18:00:00.000Z"));
      const auth = new AuthService("two-session-test-pepper");
      const app = await createNestApp({
        auth,
        engine: new WingmanEngine({ clock }),
        ephemeral: new MemoryEphemeralStore(),
        media: new MemoryMediaStore(),
        useDevAuth: false,
        skipHydrate: true,
      });
      await app.listen(0);
      const server = app.getHttpServer();
      const port = (server.address() as { port: number }).port;

      const deviceA = "test-browser-a";
      const deviceB = "test-browser-b";
      const phoneA = "+15550000001";
      const phoneB = "+15550000002";
      const requestA = await request(server).post("/auth/otp/request").send({ phoneE164: phoneA }).expect(201);
      const requestB = await request(server).post("/auth/otp/request").send({ phoneE164: phoneB }).expect(201);
      expect(requestA.body.debugCode).toMatch(/^\d{6}$/);
      expect(requestB.body.debugCode).toMatch(/^\d{6}$/);

      const sessionA = (
        await request(server)
          .post("/auth/otp/verify")
          .send({ phoneE164: phoneA, code: requestA.body.debugCode, deviceId: deviceA })
          .expect(201)
      ).body;
      const sessionB = (
        await request(server)
          .post("/auth/otp/verify")
          .send({ phoneE164: phoneB, code: requestB.body.debugCode, deviceId: deviceB })
          .expect(201)
      ).body;
      expect(sessionA.userId).not.toBe(sessionB.userId);

      const a = authHeaders(sessionA, deviceA);
      const b = authHeaders(sessionB, deviceB);
      for (const [headers, profile] of [
        [a, { gender: "MALE", interestedIn: ["WOMEN"], firstName: "A", birthDate: "1995-01-01" }],
        [b, { gender: "FEMALE", interestedIn: ["MEN"], firstName: "B", birthDate: "1996-01-01" }],
      ] as const) {
        await request(server).post("/me/profile").set(headers).send(profile).expect(201);
        await request(server)
          .post("/privacy/consent")
          .set(headers)
          .send({ purpose: "radar", policyVersion: "v1" })
          .expect(201);
      }

      await request(server).post("/radar/activate").set(a).send({ lat: 48.8566, lng: 2.3522 }).expect(201);
      const alone = await request(server).get("/radar/candidates").set(a).expect(200);
      expect(alone.body.candidates).toEqual([]);
      await request(server).post("/radar/activate").set(b).send({ lat: 48.8567, lng: 2.3523 }).expect(201);
      const candidates = await request(server).get("/radar/candidates").set(a).expect(200);
      expect(candidates.body.candidates.map((candidate: { userId: string }) => candidate.userId)).toContain(sessionB.userId);

      const socketA = await connectSessionSocket(port, sessionA, deviceA);
      const socketB = await connectSessionSocket(port, sessionB, deviceB);
      const receivedSignal = waitForEvent(socketB, "signal.received");
      const signal = await request(server)
        .post("/signals")
        .set(a)
        .set("idempotency-key", "two-session-signal")
        .send({ receiverId: sessionB.userId, source: "RADAR" })
        .expect(201);
      expect((await receivedSignal).aggregateId).toBe(signal.body.signal.id);

      await request(server).post(`/signals/${signal.body.signal.id}/open`).set(b).expect(201);
      const accepted = await request(server).post(`/signals/${signal.body.signal.id}/accept`).set(b).expect(201);
      const connectionId = accepted.body.connection.id as string;

      const mediaA = await request(server)
        .post(`/connections/${connectionId}/media`)
        .set(a)
        .attach("file", TINY_JPEG, { filename: "a.jpg", contentType: "image/jpeg" })
        .expect(201);
      await request(server)
        .post(`/connections/${connectionId}/selfie`)
        .set(a)
        .send({ mediaId: mediaA.body.mediaId })
        .expect(201);
      await request(server)
        .get(`/connections/${connectionId}/media/${mediaA.body.mediaId}`)
        .set(b)
        .expect(200);
      const mediaB = await request(server)
        .post(`/connections/${connectionId}/media`)
        .set(b)
        .attach("file", TINY_JPEG, { filename: "b.jpg", contentType: "image/jpeg" })
        .expect(201);
      await request(server)
        .post(`/connections/${connectionId}/selfie`)
        .set(b)
        .send({ mediaId: mediaB.body.mediaId })
        .expect(201);
      await request(server).post(`/connections/${connectionId}/approve`).set(a).expect(201);
      await request(server).post(`/connections/${connectionId}/meet-now`).set(a).expect(201);

      await new Promise((resolve) => socketB.emit("subscribe", { connectionId, missionId: connectionId }, resolve));
      const receivedMessage = waitForEvent(socketB, "mission.message");
      await request(server)
        .post(`/connections/${connectionId}/messages`)
        .set(a)
        .send({ text: "Meet by the entrance" })
        .expect(201);
      expect((await receivedMessage).payload.text).toBe("Meet by the entrance");
      socketB.close();
      const reconnectedB = await connectSessionSocket(port, sessionB, deviceB);
      const history = await request(server).get(`/connections/${connectionId}/messages`).set(b).expect(200);
      expect(history.body.messages).toHaveLength(1);

      await request(server).post(`/connections/${connectionId}/lets-meet`).set(a).expect(201);
      await request(server).post(`/connections/${connectionId}/finish`).set(a).expect(201);
      await request(server).post(`/connections/${connectionId}/outcome`).set(a).send({ outcome: "YES" }).expect(201);
      const cooldown = await request(server)
        .post(`/connections/${connectionId}/outcome`)
        .set(b)
        .send({ outcome: "YES" })
        .expect(201);
      expect(cooldown.body.connection.state).toBe("COOLDOWN_ACTIVE");

      socketA.close();
      reconnectedB.close();
      await app.close();
    },
    25_000,
  );
});
