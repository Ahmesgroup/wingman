import { describe, expect, it } from "vitest";
import request from "supertest";
import { AuthService } from "@wingman/auth";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { createNestApp } from "./testing/create-nest-app.js";

describe("S9 auth HTTP", () => {
  it("issues session, binds device, rejects replay after logout", async () => {
    process.env.AUTH_DEBUG_OTP = "true";
    const auth = new AuthService("test-pepper");
    const app = await createNestApp({
      auth,
      ephemeral: new MemoryEphemeralStore(),
      useDevAuth: false,
    });
    const server = app.getHttpServer();

    const otp = await request(server).post("/auth/otp/request").send({ phoneE164: "+33611111111" }).expect(201);
    // Nest default is 201 for Post - might be 200. Check status
    const reqRes = otp.status === 201 || otp.status === 200 ? otp : otp;
    expect(reqRes.body.challengeId).toBeTruthy();
    const code = reqRes.body.debugCode as string;
    expect(code).toMatch(/^\d{6}$/);

    const verified = await request(server)
      .post("/auth/otp/verify")
      .send({ phoneE164: "+33611111111", code, deviceId: "dev-a" })
      .expect((res) => {
        if (![200, 201].includes(res.status)) throw new Error(String(res.status));
      });

    const token = verified.body.accessToken as string;
    process.env.AUTH_ALLOW_DEV = "true";
    await request(server).post("/dev/seed").send({ id: verified.body.userId, gender: "MALE", interestedIn: ["WOMEN"] }).expect(201);
    process.env.AUTH_ALLOW_DEV = "false";

    // seed is public; radar needs bearer
    await request(server)
      .post("/radar/activate")
      .set("authorization", `Bearer ${token}`)
      .set("x-device-id", "dev-a")
      .send({ lat: 48.85, lng: 2.35 })
      .expect(201);

    await request(server)
      .post("/radar/activate")
      .set("authorization", `Bearer ${token}`)
      .set("x-device-id", "other-device")
      .send({ lat: 48.85, lng: 2.35 })
      .expect(401);

    await request(server).post("/auth/logout").set("authorization", `Bearer ${token}`).expect(201);

    await request(server)
      .post("/radar/activate")
      .set("authorization", `Bearer ${token}`)
      .set("x-device-id", "dev-a")
      .send({ lat: 48.85, lng: 2.35 })
      .expect(401);

    await app.close();
  });
});
