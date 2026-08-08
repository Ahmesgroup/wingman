import { describe, expect, it } from "vitest";
import { MemoryEphemeralStore } from "./memory-store.js";

describe("MemoryEphemeralStore", () => {
  it("enforces distributed lock ownership", async () => {
    const store = new MemoryEphemeralStore();
    expect(await store.acquireLock("pair:a:b", "inst-1", 30)).toBe(true);
    expect(await store.acquireLock("pair:a:b", "inst-2", 30)).toBe(false);
    await store.releaseLock("pair:a:b", "inst-1");
    expect(await store.acquireLock("pair:a:b", "inst-2", 30)).toBe(true);
  });
});
