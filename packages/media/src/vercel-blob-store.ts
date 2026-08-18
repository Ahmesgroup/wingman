import { del, get, list, put } from "@vercel/blob";
import {
  assertSelfieUpload,
  newOpaqueMediaId,
  type MediaBytes,
  type MediaObjectMeta,
  type MediaPutInput,
  type MediaStore,
} from "./types.js";

type StoredMeta = {
  mediaId: string;
  connectionId: string;
  uploaderId: string;
  contentType: string;
  byteLength: number;
  createdAt: string;
  expiresAt: string;
  blobUrl: string;
};

/**
 * Private Vercel Blob store (access: 'private').
 * Clients never receive blobUrl — only opaque mediaId; bytes stream via authorized API.
 */
export class VercelBlobMediaStore implements MediaStore {
  readonly name = "vercel_blob";

  constructor(private readonly token: string) {
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN required for vercel_blob media store");
  }

  private metaPath(mediaId: string): string {
    return `selfies/meta/${mediaId}.json`;
  }

  private bytesPath(mediaId: string, contentType: string): string {
    const ext =
      contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    return `selfies/obj/${mediaId}.${ext}`;
  }

  private async putJson(pathname: string, value: unknown): Promise<string> {
    const res = await put(pathname, JSON.stringify(value), {
      access: "private",
      token: this.token,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.url;
  }

  private async readJson<T>(pathname: string): Promise<T | null> {
    try {
      const result = await get(pathname, { access: "private", token: this.token, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const buf = await streamToUint8Array(result.stream);
      return JSON.parse(new TextDecoder().decode(buf)) as T;
    } catch {
      return null;
    }
  }

  private toMeta(s: StoredMeta): MediaObjectMeta {
    return {
      mediaId: s.mediaId,
      connectionId: s.connectionId,
      uploaderId: s.uploaderId,
      contentType: s.contentType,
      byteLength: s.byteLength,
      createdAt: new Date(s.createdAt),
      expiresAt: new Date(s.expiresAt),
    };
  }

  async put(input: MediaPutInput): Promise<MediaObjectMeta> {
    assertSelfieUpload(input.contentType, input.body.byteLength);
    const contentType = input.contentType.split(";")[0]!.trim().toLowerCase();
    const mediaId = newOpaqueMediaId();
    const bytesPath = this.bytesPath(mediaId, contentType);
    const blob = await put(bytesPath, Buffer.from(input.body), {
      access: "private",
      token: this.token,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const stored: StoredMeta = {
      mediaId,
      connectionId: input.connectionId,
      uploaderId: input.uploaderId,
      contentType,
      byteLength: input.body.byteLength,
      createdAt: (input.createdAt ?? new Date()).toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      blobUrl: blob.url,
    };
    await this.putJson(this.metaPath(mediaId), stored);
    return this.toMeta(stored);
  }

  async getMeta(mediaId: string): Promise<MediaObjectMeta | null> {
    const s = await this.readJson<StoredMeta>(this.metaPath(mediaId));
    return s ? this.toMeta(s) : null;
  }

  async getBytes(mediaId: string): Promise<MediaBytes | null> {
    const s = await this.readJson<StoredMeta>(this.metaPath(mediaId));
    if (!s) return null;
    try {
      const bytesPath = this.bytesPath(mediaId, s.contentType);
      const result = await get(bytesPath, { access: "private", token: this.token, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const body = await streamToUint8Array(result.stream);
      return { meta: this.toMeta(s), body };
    } catch {
      return null;
    }
  }

  async delete(mediaId: string): Promise<boolean> {
    const s = await this.readJson<StoredMeta>(this.metaPath(mediaId));
    if (!s) return false;
    const paths = [this.metaPath(mediaId), this.bytesPath(mediaId, s.contentType)];
    await del(paths, { token: this.token });
    return true;
  }

  async deleteByConnection(connectionId: string): Promise<number> {
    // List meta prefix and filter — Vercel Blob list is best-effort for purge.
    let deleted = 0;
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix: "selfies/meta/",
        token: this.token,
        cursor,
        limit: 100,
      });
      for (const blob of page.blobs) {
        const mediaId = blob.pathname.replace(/^selfies\/meta\//, "").replace(/\.json$/, "");
        const s = await this.readJson<StoredMeta>(blob.pathname);
        if (s && s.connectionId === connectionId) {
          if (await this.delete(mediaId)) deleted += 1;
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return deleted;
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    let deleted = 0;
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix: "selfies/meta/",
        token: this.token,
        cursor,
        limit: 100,
      });
      for (const blob of page.blobs) {
        const mediaId = blob.pathname.replace(/^selfies\/meta\//, "").replace(/\.json$/, "");
        const s = await this.readJson<StoredMeta>(blob.pathname);
        if (s && new Date(s.expiresAt).getTime() <= now.getTime()) {
          if (await this.delete(mediaId)) deleted += 1;
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return deleted;
  }

  async ping(): Promise<boolean> {
    try {
      await list({ prefix: "selfies/", token: this.token, limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
