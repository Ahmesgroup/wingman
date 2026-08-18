import { afterEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { AuthService } from "@wingman/auth";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { MemoryMediaStore } from "@wingman/media";
import type { RealtimeEnvelope } from "@wingman/realtime";
import { createNestApp } from "./testing/create-nest-app.js";
import { uploadSelfieMedia } from "./testing/selfie-media.js";

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

function candidateIds(body: { candidates?: { userId: string }[] }): string[] {
  return (body.candidates ?? []).map((candidate) => candidate.userId);
}

function waitForEvent(socket: Socket, type: string, timeoutMs = 4_000): Promise<RealtimeEnvelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const handler = (event: RealtimeEnvelope) => {
      if (event.type !== type) return;
      clearTimeout(timer);
      socket.off("event", handler);
      resolve(event);
    };
    socket.on("event", handler);
  });
}

function collectEvents(socket: Socket, type: string, ms: number): Promise<RealtimeEnvelope[]> {
  const seen: RealtimeEnvelope[] = [];
  const handler = (event: RealtimeEnvelope) => {
    if (event.type === type) seen.push(event);
  };
  socket.on("event", handler);
  return new Promise((resolve) => {
    setTimeout(() => {
      socket.off("event", handler);
      resolve(seen);
    }, ms);
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

function connectDevSocket(port: number, userId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      path: "/ws",
      transports: ["websocket"],
      auth: { userId },
      forceNew: true,
    });
    socket.on("ready", () => resolve(socket));
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket connect timeout")), 4_000);
  });
}

async function otpSession(
  server: import("http").Server,
  phoneE164: string,
  deviceId: string,
): Promise<{ userId: string; accessToken: string }> {
  const requested = await request(server).post("/auth/otp/request").send({ phoneE164 }).expect(201);
  const session = (
    await request(server)
      .post("/auth/otp/verify")
      .send({ phoneE164, code: requested.body.debugCode, deviceId })
      .expect(201)
  ).body;
  return session;
}

describe("S29 real multi-user realtime", () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it(
    "session A receives radar.changed when B appears after WS was already connected, then signal.received without refresh",
    async () => {
      process.env.AUTH_DEBUG_OTP = "true";
      process.env.AUTH_FIELD_TEST_MODE = "false";
      process.env.AUTH_ALLOW_DEV = "false";
      process.env.OTP_PROVIDER = "local";

      const clock = new FakeClock(new Date("2026-08-18T18:00:00.000Z"));
      const auth = new AuthService("s29-appear-pepper");
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

      const deviceA = "s29-a";
      const deviceB = "s29-b";
      const sessionA = await otpSession(server, "+15550002901", deviceA);
      const sessionB = await otpSession(server, "+15550002902", deviceB);
      const a = authHeaders(sessionA, deviceA);
      const b = authHeaders(sessionB, deviceB);
      await request(server)
        .post("/me/profile")
        .set(a)
        .send({ gender: "MALE", interestedIn: ["WOMEN"], firstName: "A", birthDate: "1995-01-01" })
        .expect(201);
      await request(server)
        .post("/me/profile")
        .set(b)
        .send({ gender: "FEMALE", interestedIn: ["MEN"], firstName: "B", birthDate: "1996-01-01" })
        .expect(201);
      await request(server).post("/privacy/consent").set(a).send({ purpose: "radar", policyVersion: "v1" }).expect(201);
      await request(server).post("/privacy/consent").set(b).send({ purpose: "radar", policyVersion: "v1" }).expect(201);

      // Product order: sockets connect at login, before Go active.
      const socketA = await connectSessionSocket(port, sessionA, deviceA);
      const socketB = await connectSessionSocket(port, sessionB, deviceB);

      await request(server).post("/radar/activate").set(a).send({ lat: 48.8566, lng: 2.3522 }).expect(201);
      const appeared = waitForEvent(socketA, "radar.changed");
      await request(server).post("/radar/activate").set(b).send({ lat: 48.8567, lng: 2.3523 }).expect(201);
      const radarEv = await appeared;
      expect(radarEv.payload.reason).toBe("presence");
      expect(candidateIds((await request(server).get("/radar/candidates").set(a).expect(200)).body)).toEqual([
        sessionB.userId,
      ]);

      const receivedSignal = waitForEvent(socketB, "signal.received");
      const signal = await request(server)
        .post("/signals")
        .set(a)
        .set("idempotency-key", "s29-signal")
        .send({ receiverId: sessionB.userId, source: "RADAR" })
        .expect(201);
      const signalEv = await receivedSignal;
      expect(signalEv.aggregateId).toBe(signal.body.signal.id);
      expect(signalEv.payload.senderId).toBe(sessionA.userId);

      socketA.close();
      socketB.close();
      await app.close();
    },
    25_000,
  );

  it(
    "block emits radar.changed so both sessions drop the peer without polling; third user stays denied",
    async () => {
      process.env.AUTH_DEBUG_OTP = "true";
      process.env.AUTH_FIELD_TEST_MODE = "false";
      process.env.AUTH_ALLOW_DEV = "false";
      process.env.OTP_PROVIDER = "local";

      const clock = new FakeClock(new Date("2026-08-18T18:10:00.000Z"));
      const auth = new AuthService("s29-block-pepper");
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

      const deviceA = "s29-block-a";
      const deviceB = "s29-block-b";
      const deviceC = "s29-block-c";
      const sessionA = await otpSession(server, "+15550002911", deviceA);
      const sessionB = await otpSession(server, "+15550002912", deviceB);
      const sessionC = await otpSession(server, "+15550002913", deviceC);
      const a = authHeaders(sessionA, deviceA);
      const b = authHeaders(sessionB, deviceB);
      const c = authHeaders(sessionC, deviceC);
      for (const [headers, profile] of [
        [a, { gender: "MALE", interestedIn: ["WOMEN"], firstName: "A", birthDate: "1995-01-01" }],
        [b, { gender: "FEMALE", interestedIn: ["MEN"], firstName: "B", birthDate: "1996-01-01" }],
        [c, { gender: "MALE", interestedIn: ["WOMEN"], firstName: "C", birthDate: "1994-01-01" }],
      ] as const) {
        await request(server).post("/me/profile").set(headers).send(profile).expect(201);
        await request(server)
          .post("/privacy/consent")
          .set(headers)
          .send({ purpose: "radar", policyVersion: "v1" })
          .expect(201);
      }

      await request(server).post("/radar/activate").set(a).send({ lat: 48.8566, lng: 2.3522 }).expect(201);
      await request(server).post("/radar/activate").set(b).send({ lat: 48.8567, lng: 2.3523 }).expect(201);
      const socketA = await connectSessionSocket(port, sessionA, deviceA);
      const socketB = await connectSessionSocket(port, sessionB, deviceB);

      const signal = await request(server)
        .post("/signals")
        .set(a)
        .set("idempotency-key", "s29-block-signal")
        .send({ receiverId: sessionB.userId, source: "RADAR" })
        .expect(201);
      await request(server).post(`/signals/${signal.body.signal.id}/open`).set(b).expect(201);
      const accepted = await request(server).post(`/signals/${signal.body.signal.id}/accept`).set(b).expect(201);
      const connectionId = accepted.body.connection.id as string;

      await request(server).get(`/connections/${connectionId}`).set(c).expect(404);
      await request(server).get(`/connections/${connectionId}/messages`).set(c).expect(404);
      await request(server)
        .post(`/connections/${connectionId}/messages`)
        .set(c)
        .send({ text: "third user should be denied" })
        .expect(404);

      const radarA = waitForEvent(socketA, "radar.changed");
      const radarB = waitForEvent(socketB, "radar.changed");
      await request(server).post("/safety/block").set(a).send({ userId: sessionB.userId }).expect(201);
      expect((await radarA).payload.reason).toBe("block");
      expect((await radarB).payload.reason).toBe("block");
      expect(candidateIds((await request(server).get("/radar/candidates").set(a).expect(200)).body)).not.toContain(
        sessionB.userId,
      );
      expect(candidateIds((await request(server).get("/radar/candidates").set(b).expect(200)).body)).not.toContain(
        sessionA.userId,
      );

      socketA.close();
      socketB.close();
      await app.close();
    },
    25_000,
  );

  it(
    "same-zone heartbeat does not emit radar.changed (no poll spam)",
    async () => {
      const clock = new FakeClock(new Date("2026-08-18T18:20:00.000Z"));
      const app = await createNestApp({
        engine: new WingmanEngine({ clock }),
        ephemeral: new MemoryEphemeralStore(),
        skipHydrate: true,
      });
      await app.listen(0);
      const server = app.getHttpServer();
      const port = (server.address() as { port: number }).port;

      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
      const sockA = await connectDevSocket(port, "a");
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.8566, lng: 2.3522 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8567, lng: 2.3523 }).expect(201);

      const pending = collectEvents(sockA, "radar.changed", 400);
      await request(server)
        .post("/radar/heartbeat")
        .set("x-user-id", "a")
        .send({ lat: 48.8566, lng: 2.3522 })
        .expect(201);
      await request(server)
        .post("/radar/heartbeat")
        .set("x-user-id", "b")
        .send({ lat: 48.8567, lng: 2.3523 })
        .expect(201);
      expect(await pending).toEqual([]);

      sockA.close();
      await app.close();
    },
    15_000,
  );

  it(
    "mission chat both directions over WS; reconnect restores GET history; third user denied",
    async () => {
      const clock = new FakeClock(new Date("2026-08-18T18:30:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({
        engine,
        ephemeral: new MemoryEphemeralStore(),
        skipHydrate: true,
      });
      await app.listen(0);
      const server = app.getHttpServer();
      const port = (server.address() as { port: number }).port;

      await request(server).post("/dev/seed").send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/dev/seed").send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] }).expect(201);
      await request(server).post("/dev/seed").send({ id: "c", gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "a").send({ lat: 48.85, lng: 2.35 }).expect(201);
      await request(server).post("/radar/activate").set("x-user-id", "b").send({ lat: 48.8501, lng: 2.3501 }).expect(201);
      const sig = await request(server).post("/signals").set("x-user-id", "a").send({ receiverId: "b" }).expect(201);
      await request(server).post(`/signals/${sig.body.signal.id}/open`).set("x-user-id", "b").expect(201);
      const accept = await request(server).post(`/signals/${sig.body.signal.id}/accept`).set("x-user-id", "b").expect(201);
      const connectionId = accept.body.connection.id as string;
      const mediaA = await uploadSelfieMedia(server, connectionId, "a");
      const mediaB = await uploadSelfieMedia(server, connectionId, "b");
      await request(server)
        .post(`/connections/${connectionId}/selfie`)
        .set("x-user-id", "a")
        .send({ mediaId: mediaA })
        .expect(201);
      await request(server)
        .post(`/connections/${connectionId}/selfie`)
        .set("x-user-id", "b")
        .send({ mediaId: mediaB })
        .expect(201);
      await request(server).post(`/connections/${connectionId}/approve`).set("x-user-id", "a").expect(201);
      await request(server).post(`/connections/${connectionId}/meet-now`).set("x-user-id", "a").expect(201);

      await request(server).get(`/connections/${connectionId}/messages`).set("x-user-id", "c").expect(404);
      await request(server)
        .post(`/connections/${connectionId}/messages`)
        .set("x-user-id", "c")
        .send({ text: "nope" })
        .expect(404);

      const sockA = await connectDevSocket(port, "a");
      const sockB = await connectDevSocket(port, "b");
      const sockC = await connectDevSocket(port, "c");
      await new Promise((r) => sockA.emit("subscribe", { connectionId, missionId: connectionId }, r));
      await new Promise((r) => sockB.emit("subscribe", { connectionId, missionId: connectionId }, r));
      const denied = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
        sockC.emit("subscribe", { connectionId, missionId: connectionId }, (ack: { ok: boolean; code?: string }) =>
          resolve(ack),
        );
      });
      expect(denied.ok).toBe(false);
      expect(denied.code).toBe("FORBIDDEN");

      const toB = waitForEvent(sockB, "mission.message");
      await request(server)
        .post(`/connections/${connectionId}/messages`)
        .set("x-user-id", "a")
        .send({ text: "At the terrace" })
        .expect(201);
      expect((await toB).payload.text).toBe("At the terrace");

      const toA = waitForEvent(sockA, "mission.message");
      await request(server)
        .post(`/connections/${connectionId}/messages`)
        .set("x-user-id", "b")
        .send({ text: "On my way" })
        .expect(201);
      expect((await toA).payload.text).toBe("On my way");

      sockB.close();
      const reconnected = await connectDevSocket(port, "b");
      const history = await request(server).get(`/connections/${connectionId}/messages`).set("x-user-id", "b").expect(200);
      expect(history.body.messages.map((m: { text: string }) => m.text)).toEqual(["At the terrace", "On my way"]);

      sockA.close();
      reconnected.close();
      sockC.close();
      await app.close();
    },
    25_000,
  );
});
