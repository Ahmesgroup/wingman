import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock.js";
import { DomainError } from "./errors.js";
import { WingmanEngine } from "./engine.js";
import { ageYearsFromBirthDate } from "./radar/engine.js";

describe("profile update (protocol onboarding)", () => {
  it("ageYearsFromBirthDate computes calendar age", () => {
    const now = new Date("2026-08-17T12:00:00.000Z");
    expect(ageYearsFromBirthDate("2008-08-17", now)).toBe(18);
    expect(ageYearsFromBirthDate("2008-08-18", now)).toBe(17);
    expect(ageYearsFromBirthDate("1990-01-01", now)).toBe(36);
  });

  it("updateProfile persists gender/interestedIn and rejects under-18", () => {
    const clock = new FakeClock(new Date("2026-08-17T12:00:00.000Z"));
    const engine = new WingmanEngine({ clock });
    engine.seedUser({
      id: "u1",
      profile: { userId: "u1", gender: "NON_BINARY", interestedIn: ["MEN", "WOMEN", "NON_BINARY_PEOPLE"] },
    });

    const saved = engine.updateProfile("u1", {
      gender: "MALE",
      interestedIn: ["WOMEN"],
      firstName: "Alex",
      birthDate: "1998-04-12",
      heightCm: 178,
      dailyBio: "Around today",
      interests: ["Music", "Food"],
    });
    expect(saved.profile.gender).toBe("MALE");
    expect(saved.profile.interestedIn).toEqual(["WOMEN"]);
    expect(saved.profile.firstName).toBe("Alex");
    expect(saved.profile.birthDate).toBe("1998-04-12");

    const withLocale = engine.updateProfile("u1", {
      gender: "MALE",
      interestedIn: ["WOMEN"],
      firstName: "Alex",
      birthDate: "1998-04-12",
      locale: "fr",
    });
    expect(withLocale.profile.locale).toBe("fr");

    expect(() =>
      engine.updateProfile("u1", {
        gender: "MALE",
        interestedIn: ["WOMEN"],
        birthDate: "2010-01-01",
      }),
    ).toThrow(DomainError);

    expect(() => engine.updateProfile("missing", { gender: "MALE", interestedIn: ["WOMEN"] })).toThrow(
      DomainError,
    );
  });
});
