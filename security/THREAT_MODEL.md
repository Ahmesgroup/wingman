# Threat Model

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

For each threat: description, likelihood, impact, prevention, detection, response, evidence, residual limits.

| Threat | Prevention (summary) |
|---|---|
| Stalking / reverse-location | approximate radius only; no exact position; Destiny gated + off by default |
| Radar scraping | throttled candidate reads; anonymized dots; compatibility filter server-side |
| Fake accounts / SIM farming | phone verification + liveness; anomaly detection |
| OTP abuse | tight per-phone/IP limits; hashed codes; attempt caps |
| Selfie replay / deepfake | real-time capture + liveness + timestamp |
| Leaked signed URL | very short TTL; recipient+session scope; no logging |
| Signal spam / harassment | quotas; silent expiry; block+report; moderation |
| Coordinated false reports | no auto permanent ban; human review; abuse detection |
| Anti-contact bypass | server-side filter before append; reminders |
| Race conditions / double connection | ActiveUserLock (PK); partial unique indexes; atomic tx |
| Session theft / account compromise | hashed tokens; expiry/revocation; device binding |
| Admin abuse / evidence access | least privilege; ModerationAuditLog on every access |
| Phone exfiltration | HMAC+AES; no raw storage; access audited |
| Log leakage | strict redaction; no sensitive payloads in telemetry |
| Incomplete deletion | purge jobs + reconciliation + deletion metrics |
| Payment fraud / double charge | idempotency keys; unique providerRef |
| Minors | min age 18; verification; minor-safety report category → priority |
| Sensitive locations | Destiny allow-list; exclusions; DPIA |
