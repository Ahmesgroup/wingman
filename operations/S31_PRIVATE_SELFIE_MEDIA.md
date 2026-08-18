# S31 — Private Selfie Media (minimum real path)

**Status:** **WIRED (infra)** — private store + camera upload path + authz hardening; Evidence Pack still **NOT STARTED**  
**Updated:** 2026-08-18  
**PRODUCT PROTOCOL READY:** **NO**

## Locked status language

| Area | Status |
|------|--------|
| Protocol wiring | improved |
| Production durability | **GO (infra)** |
| Private selfie media | **WIRED (infra)** — not GREEN until two-phone Evidence Pack |
| Two-phone Evidence Pack | **NOT STARTED / BLOCKED** until field proof of camera+peer visibility |
| PRODUCT PROTOCOL READY | **NO** |

## Storage choice

**Vercel Blob (`access: 'private'`)** via `@wingman/media` → `VercelBlobMediaStore`.

Why:
- Architecture requires private object storage, opaque ids, no public permanent URLs, authorized peer access, expiry/purge (`architecture/MEDIA_ARCHITECTURE.md`, ADR-004, D-014).
- Monorepo already reserved `packages/media` for encapsulating object storage.
- API already runs on Vercel; Blob matches the Neon/Upstash marketplace ops pattern (provision + env, no custom EU S3 account for minimum path).
- Clients never receive blob URLs — only opaque `mediaId`; bytes stream through `GET /connections/:id/media/:mediaId` after Connection authorization.

Future S3/R2 with `MEDIA_BUCKET` / KMS remains compatible with the same `MediaStore` interface.

## Wired surface

| Step | Behavior |
|------|----------|
| Capture | Prototype: `getUserMedia` only (no gallery `<input type=file>`). Permission denied stays blocking — send disabled, no fake selfie. |
| Copy | EN: “Send a live selfie” / “Let them know it’s really you.” / “Visible only for this Wingman.” FR natural equivalents. |
| Upload | `POST /connections/:id/media` multipart `file` → private store → `{ mediaId, capturedAt }` (opaque; server clock) |
| Bind | `POST /connections/:id/selfie` `{ mediaId }` — rejects forged/unregistered/expired/wrong-connection ids |
| Peer view | `GET /connections/:id/media/:mediaId` — participant only; peer only after mediaId bound on Connection; expired → 404; `Cache-Control: no-store, private` |
| Timestamp | Exact capture time is `MediaObjectMeta.createdAt` from the engine clock at PUT — not the client clock. Returned as `capturedAt`. Not stored on the Signal/Connection domain merge. |
| Slow net | Upload aborts ~12s; UI shows honest failure (`t_slow_net`); no bind after timeout. |
| Purge | `deleteByConnection` on closed/expired reconcile + `purgeExpired` TTL sweep; GET also fail-closes expired objects |

Canonical engines stay **Signal ≠ Selfie media ≠ Connection**. S35 Selfie=Signal remains **false**.

## Production env names (no values)

| Name | Purpose |
|------|---------|
| `MEDIA_PROVIDER` | `vercel_blob` (required under `WINGMAN_PUBLIC_PROD=true`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob RW token (or alias `MEDIA_BLOB_READ_WRITE_TOKEN`) |

Public prod fails closed if token/provider missing (no silent memory media).

## Provisioned (2026-08-17)

| Resource | Provider | Vercel resource | Region | Env (Production) |
|----------|----------|-----------------|--------|------------------|
| Selfie media | Vercel Blob private | `wingman-selfies` | cdg1 | `BLOB_READ_WRITE_TOKEN`, `MEDIA_PROVIDER` |

Secrets never committed / never printed.

## Honest remaining for S31 GREEN

- Two-phone Evidence Pack rows for camera A/B, peer-only visibility, expiry, permission denied, slow network
- ~~Confirm Production `/internal/ready` shows `media.detail=vercel_blob`~~ **DONE** (2026-08-17 post-redeploy)
- No claim of PRODUCT PROTOCOL READY until Evidence Pack + remaining S27–S34 gates

## Verify

```bash
curl -s https://wingman-api-three.vercel.app/internal/ready
# expect checks.media.detail = vercel_blob (after Production env + redeploy)
```
