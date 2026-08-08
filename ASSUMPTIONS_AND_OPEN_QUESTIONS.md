# Assumptions & Open Questions

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

**Assumptions:** min age 18; EU launch in one city; PSP + push providers with EU residency; liveness via on-device
detection in V1 (no biometric templates stored); Redis provider allows disabling persistence for sensitive
namespaces.

**Open (blocking before the relevant feature):**
- Legal basis + retention specifics for consent proof after deletion (D-018/ACCOUNT_DELETION).
- Liveness/biometric scope and appeal (SELFIE_SECURITY) — needs DPIA + legal.
- Destiny thresholds, allow-list of contexts, sensitive-area exclusions — needs DPIA (DESTINY_PRIVACY_ASSESSMENT).
- Final Wingman+ daily signal number within 20–25 (tune against abuse).
- Exact adaptive-radius parameters and compatibility scoring.
- Confirmation of provider guarantees for Redis persistence/backups and EU residency.
