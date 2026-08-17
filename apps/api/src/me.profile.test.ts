import { describe, expect, it } from "vitest";
import request from "supertest";
import { FakeClock, WingmanEngine } from "@wingman/domain";
import { MemoryEphemeralStore } from "@wingman/ephemeral";
import { createNestApp } from "./testing/create-nest-app.js";

describe("POST /me/profile", () => {
  it(
    "persists profile for authenticated identity and drives radar eligibility",
    async () => {
      const clock = new FakeClock(new Date("2026-08-17T12:00:00.000Z"));
      const engine = new WingmanEngine({ clock });
      const app = await createNestApp({
        engine,
        ephemeral: new MemoryEphemeralStore(),
        skipHydrate: true,
      });
      const server = app.getHttpServer();

      await request(server)
        .post("/dev/seed")
        .send({ id: "a", gender: "NON_BINARY", interestedIn: ["MEN", "WOMEN", "NON_BINARY_PEOPLE"] })
        .expect(201);

      const saved = await request(server)
        .post("/me/profile")
        .set("x-user-id", "a")
        .send({
          firstName: "Alex",
          birthDate: "1998-04-12",
          gender: "MALE",
          interestedIn: ["WOMEN"],
          heightCm: 178,
          interests: ["Music", "Travel"],
          dailyBio: "Out tonight",
        })
        .expect(201);

      expect(saved.body.profile.gender).toBe("MALE");
      expect(saved.body.profile.interestedIn).toEqual(["WOMEN"]);
      expect(saved.body.profile.firstName).toBe("Alex");
      expect(engine.users.get("a")?.profile.gender).toBe("MALE");

      const me = await request(server).get("/me").set("x-user-id", "a").expect(200);
      expect(me.body.profile.birthDate).toBe("1998-04-12");

      await request(server)
        .post("/me/profile")
        .set("x-user-id", "a")
        .send({
          gender: "MALE",
          interestedIn: ["WOMEN"],
          birthDate: "2012-01-01",
        })
        .expect(422);

      await app.close();
    },
    20_000,
  );
});
