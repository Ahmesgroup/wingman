import request from "supertest";

/** Minimal JPEG SOI/EOI — valid enough for S31 content-type checks. */
export const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

export async function uploadSelfieMedia(
  server: import("http").Server,
  connectionId: string,
  userId: string,
): Promise<string> {
  const res = await request(server)
    .post(`/connections/${connectionId}/media`)
    .set("x-user-id", userId)
    .attach("file", TINY_JPEG, { filename: `${userId}.jpg`, contentType: "image/jpeg" })
    .expect(201);
  return res.body.mediaId as string;
}
