import { MemoryMediaStore } from "./memory-store.js";
import type { MediaStore } from "./types.js";
import { VercelBlobMediaStore } from "./vercel-blob-store.js";

export type MediaProviderName = "memory" | "vercel_blob";

/**
 * MEDIA_PROVIDER:
 * - unset / memory → MemoryMediaStore (local/tests)
 * - vercel_blob → requires BLOB_READ_WRITE_TOKEN (or MEDIA_BLOB_READ_WRITE_TOKEN)
 *
 * Public production should set MEDIA_PROVIDER=vercel_blob + token (fail-closed at infra boot).
 */
export function createMediaStoreFromEnv(env: NodeJS.ProcessEnv = process.env): MediaStore {
  const provider = (env.MEDIA_PROVIDER ?? "").trim().toLowerCase();
  const token = (env.MEDIA_BLOB_READ_WRITE_TOKEN ?? env.BLOB_READ_WRITE_TOKEN ?? "").trim();

  if (provider === "vercel_blob" || (!provider && token)) {
    if (!token) {
      throw new Error("MEDIA_PROVIDER=vercel_blob requires BLOB_READ_WRITE_TOKEN (or MEDIA_BLOB_READ_WRITE_TOKEN)");
    }
    return new VercelBlobMediaStore(token);
  }

  if (provider === "memory" || !provider) {
    return new MemoryMediaStore();
  }

  throw new Error(`Unsupported MEDIA_PROVIDER: ${provider}`);
}

export function resolveMediaProviderName(env: NodeJS.ProcessEnv = process.env): MediaProviderName {
  const provider = (env.MEDIA_PROVIDER ?? "").trim().toLowerCase();
  const token = (env.MEDIA_BLOB_READ_WRITE_TOKEN ?? env.BLOB_READ_WRITE_TOKEN ?? "").trim();
  if (provider === "vercel_blob" || (!provider && token)) return "vercel_blob";
  return "memory";
}
