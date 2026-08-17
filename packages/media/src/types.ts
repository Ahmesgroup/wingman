export type MediaObjectMeta = {
  /** Opaque public identifier — never a URL. */
  mediaId: string;
  connectionId: string;
  uploaderId: string;
  contentType: string;
  byteLength: number;
  createdAt: Date;
  expiresAt: Date;
};

export type MediaPutInput = {
  connectionId: string;
  uploaderId: string;
  contentType: string;
  body: Uint8Array;
  expiresAt: Date;
};

export type MediaBytes = {
  meta: MediaObjectMeta;
  body: Uint8Array;
};

/**
 * Private ephemeral selfie object store.
 * Bytes never live in Postgres; callers must never expose storage URLs to clients.
 */
export interface MediaStore {
  readonly name: string;
  put(input: MediaPutInput): Promise<MediaObjectMeta>;
  getMeta(mediaId: string): Promise<MediaObjectMeta | null>;
  getBytes(mediaId: string): Promise<MediaBytes | null>;
  delete(mediaId: string): Promise<boolean>;
  deleteByConnection(connectionId: string): Promise<number>;
  purgeExpired(now?: Date): Promise<number>;
  ping(): Promise<boolean>;
}

export const SELFIE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const SELFIE_MAX_BYTES = 2_500_000;

export function assertSelfieUpload(contentType: string, byteLength: number): void {
  const ct = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!SELFIE_CONTENT_TYPES.has(ct)) {
    throw new Error(`UNSUPPORTED_MEDIA_TYPE:${ct || "missing"}`);
  }
  if (byteLength <= 0 || byteLength > SELFIE_MAX_BYTES) {
    throw new Error(`MEDIA_SIZE_INVALID:${byteLength}`);
  }
}

export function newOpaqueMediaId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `m_${crypto.randomUUID().replace(/-/g, "")}`;
    }
  } catch {
    /* fall through */
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
