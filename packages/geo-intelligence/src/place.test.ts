import { describe, expect, it } from "vitest";
import { publicViewerPlace, reverseViewerCity } from "./place.js";

describe("viewer city reverse geocode", () => {
  it("maps Luxembourg-Ville to city only — no lat/lng in public shape", () => {
    const pub = publicViewerPlace(49.6116, 6.1319);
    expect(pub).toEqual({ city: "Luxembourg" });
    expect(JSON.stringify(pub)).not.toMatch(/lat|lng|49\.|6\.13|address|street/i);
  });

  it("maps Esch-sur-Alzette", () => {
    expect(reverseViewerCity(49.4958, 5.9806)?.city).toBe("Esch-sur-Alzette");
  });

  it("does not invent a city outside the gazetteer", () => {
    expect(publicViewerPlace(48.8566, 2.3522)).toBeNull();
    expect(publicViewerPlace(40.7128, -74.006)).toBeNull();
  });
});
