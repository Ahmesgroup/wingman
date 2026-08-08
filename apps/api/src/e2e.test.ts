import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine, WINDOWS_MS } from "@wingman/domain";
import { createApp } from "./app.js";

describe("API e2e protocol", () => {
  it("completes loop over HTTP without frontend", async () => {
    const clock = new FakeClock(new Date("2026-08-08T18:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    const app = createApp({ engine });

    await request(app)
      .post("/dev/seed")
      .send({ id: "a", gender: "MALE", interestedIn: ["WOMEN"] })
      .expect(201);
    await request(app)
      .post("/dev/seed")
      .send({ id: "b", gender: "FEMALE", interestedIn: ["MEN"] })
      .expect(201);

    await request(app)
      .post("/radar/activate")
      .set("x-user-id", "a")
      .send({ lat: 48.8566, lng: 2.3522 })
      .expect(201);
    await request(app)
      .post("/radar/activate")
      .set("x-user-id", "b")
      .send({ lat: 48.8567, lng: 2.3523 })
      .expect(201);

    const candidates = await request(app).get("/radar/candidates").set("x-user-id", "a").expect(200);
    expect(candidates.body.candidates[0].userId).toBe("b");
    expect(candidates.body.candidates[0].lat).toBeUndefined();

    const signalRes = await request(app)
      .post("/signals")
      .set("x-user-id", "a")
      .set("idempotency-key", "k1")
      .send({ receiverId: "b" })
      .expect(201);
    const signalId = signalRes.body.signal.id;

    await request(app).post(`/signals/${signalId}/open`).set("x-user-id", "b").expect(200);
    const accept = await request(app).post(`/signals/${signalId}/accept`).set("x-user-id", "b").expect(201);
    const connectionId = accept.body.connection.id;

    await request(app)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "a")
      .send({ mediaId: "ma" })
      .expect(200);
    await request(app)
      .post(`/connections/${connectionId}/selfie`)
      .set("x-user-id", "b")
      .send({ mediaId: "mb" })
      .expect(200);
    await request(app).post(`/connections/${connectionId}/approve`).set("x-user-id", "a").expect(200);
    await request(app).post(`/connections/${connectionId}/meet-now`).set("x-user-id", "a").expect(200);
    await request(app).post(`/connections/${connectionId}/lets-meet`).set("x-user-id", "a").expect(200);

    // force chat_closed via reconcile after expiry would work; call not-this-time path via outcome after not_this_time
    // From MISSION_CONFIRMED need chat_closed — advance and reconcile
    clock.advanceMs(WINDOWS_MS.MISSION_FREE + 1);
    await request(app).post("/internal/reconcile").expect(200);

    let conn = await request(app).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("OUTCOME_PENDING");

    await request(app)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", "a")
      .send({ outcome: "YES" })
      .expect(200);
    await request(app)
      .post(`/connections/${connectionId}/outcome`)
      .set("x-user-id", "b")
      .send({ outcome: "YES" })
      .expect(200);

    conn = await request(app).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("COOLDOWN_ACTIVE");

    clock.advanceMs(WINDOWS_MS.COOLDOWN_YES + 1);
    await request(app).post("/internal/reconcile").expect(200);
    conn = await request(app).get(`/connections/${connectionId}`).set("x-user-id", "a").expect(200);
    expect(conn.body.connection.state).toBe("COMPLETED");

    const metrics = await request(app).get("/internal/metrics").expect(200);
    expect(metrics.body.destinyEnabled).toBe(false);
    expect(metrics.body.locks).toBe(0);
  });
});
