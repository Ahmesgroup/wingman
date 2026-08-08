# Phone Number Protection

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Normalize to E.164 → `phoneLookupHash = HMAC-SHA256(server_pepper, E164)` for deterministic uniqueness/lookup →
separately `phoneCiphertext = AES-256-GCM(E164)` packaged with nonce + auth tag, plus `phoneKeyVersion` for
rotation. A random per-user salt is explicitly rejected because it breaks lookup. The raw number is never stored,
displayed, or logged; administrative retrieval decrypts under audit.
