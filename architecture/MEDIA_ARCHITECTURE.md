# Media Architecture (Ephemeral Selfies)

**Status:** Decided (V4.1) · Related: `security/SELFIE_SECURITY.md`, DECISION_LOG D-014

Selfies are the most sensitive media in Wingman. They never touch PostgreSQL and never appear as public URLs.

## Capture → store → view

1. **Capture** in-app, real-time only (no gallery import), on-device liveness, timestamped.
2. **Upload** directly to a private EU bucket via a short-lived presigned PUT; server-side encryption (SSE).
   Object key is opaque (`tmp_...`).
3. **Reference** only the opaque `mediaObjectId` in Redis (`selfie-session:{connectionId}`).
4. **View** by the recipient: the API verifies the session/recipient, then issues a very short-lived signed GET
   (seconds) or streams via an authorized endpoint, with `Cache-Control: no-store, private`, `Content-Disposition:
   inline`, query strings never logged.
5. **Delete** on expiry/validation (event-driven) with a lifecycle rule as backstop; an orphan-reconciliation job
   sweeps stragglers; deletion is verified and metered.

## Honest limits

A signed URL is a *reduced exposure window*, not absolute protection: it can be reused until expiry, forwarded,
and possibly captured. "Non-downloadable" is enforced only through the app's own UI and available OS protections;
we never claim external capture is impossible.

## Moderation evidence media

Never stored in a Postgres text column. `ModerationEvidence` references an encrypted object (key + key ref + hash +
`purgeAt`); access is authorized, logged, and time-boxed.
