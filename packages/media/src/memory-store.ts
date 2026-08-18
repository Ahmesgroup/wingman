import {
  assertSelfieUpload,
  newOpaqueMediaId,
  type MediaBytes,
  type MediaObjectMeta,
  type MediaPutInput,
  type MediaStore,
} from "./types.js";

type Entry = {
  meta: MediaObjectMeta;
  body: Uint8Array;
};

/** In-process private store for tests / local without Blob token. */
export class MemoryMediaStore implements MediaStore {
  readonly name = "memory";
  private readonly byId = new Map<string, Entry>();

  async put(input: MediaPutInput): Promise<MediaObjectMeta> {
    assertSelfieUpload(input.contentType, input.body.byteLength);
    const mediaId = newOpaqueMediaId();
    const meta: MediaObjectMeta = {
      mediaId,
      connectionId: input.connectionId,
      uploaderId: input.uploaderId,
      contentType: input.contentType.split(";")[0]!.trim().toLowerCase(),
      byteLength: input.body.byteLength,
      createdAt: input.createdAt ? new Date(input.createdAt.getTime()) : new Date(),
      expiresAt: input.expiresAt,
    };
    this.byId.set(mediaId, { meta, body: Uint8Array.from(input.body) });
    return { ...meta };
  }

  async getMeta(mediaId: string): Promise<MediaObjectMeta | null> {
    const e = this.byId.get(mediaId);
    return e ? { ...e.meta } : null;
  }

  async getBytes(mediaId: string): Promise<MediaBytes | null> {
    const e = this.byId.get(mediaId);
    if (!e) return null;
    return { meta: { ...e.meta }, body: Uint8Array.from(e.body) };
  }

  async delete(mediaId: string): Promise<boolean> {
    return this.byId.delete(mediaId);
  }

  async deleteByConnection(connectionId: string): Promise<number> {
    let n = 0;
    for (const [id, e] of this.byId) {
      if (e.meta.connectionId === connectionId) {
        this.byId.delete(id);
        n += 1;
      }
    }
    return n;
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    let n = 0;
    for (const [id, e] of this.byId) {
      if (e.meta.expiresAt.getTime() <= now.getTime()) {
        this.byId.delete(id);
        n += 1;
      }
    }
    return n;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
