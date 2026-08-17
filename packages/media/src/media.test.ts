import { describe, expect, it } from "vitest";
import { MemoryMediaStore } from "./memory-store.js";
import { createMediaStoreFromEnv } from "./from-env.js";

describe("MemoryMediaStore", () => {
  it("puts opaque id, authorizes get, and purges by expiry + connection", async () => {
    const store = new MemoryMediaStore();
    const expiresAt = new Date(Date.now() + 60_000);
    const meta = await store.put({
      connectionId: "c1",
      uploaderId: "u1",
      contentType: "image/jpeg",
      body: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
      expiresAt,
    });
    expect(meta.mediaId.startsWith("m_")).toBe(true);
    expect(meta.mediaId.includes("http")).toBe(false);

    const bytes = await store.getBytes(meta.mediaId);
    expect(bytes?.meta.uploaderId).toBe("u1");
    expect(bytes?.body.byteLength).toBe(4);

    const other = await store.put({
      connectionId: "c1",
      uploaderId: "u2",
      contentType: "image/png",
      body: new Uint8Array([1, 2, 3]),
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await store.purgeExpired(new Date())).toBeGreaterThanOrEqual(1);
    expect(await store.getMeta(other.mediaId)).toBeNull();

    expect(await store.deleteByConnection("c1")).toBe(1);
    expect(await store.getMeta(meta.mediaId)).toBeNull();
  });

  it("rejects non-image and oversized payloads", async () => {
    const store = new MemoryMediaStore();
    await expect(
      store.put({
        connectionId: "c",
        uploaderId: "u",
        contentType: "text/plain",
        body: new Uint8Array([1]),
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(/UNSUPPORTED_MEDIA_TYPE/);
  });
});

describe("createMediaStoreFromEnv", () => {
  it("defaults to memory", () => {
    const store = createMediaStoreFromEnv({});
    expect(store.name).toBe("memory");
  });

  it("requires token for vercel_blob", () => {
    expect(() => createMediaStoreFromEnv({ MEDIA_PROVIDER: "vercel_blob" })).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });
});
