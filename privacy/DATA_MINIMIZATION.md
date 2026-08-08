# Data Minimization

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Collect only what the protocol needs: birth date (not full precision beyond need), coarse location (never precise
persisted), opaque media ids (not URLs), phone as HMAC+ciphertext (not raw). Ephemeral data (location, selfies, chat)
lives in Redis/private storage with short TTLs. Analytics are aggregated and free of sensitive text. Consent does not
remove the minimization duty, especially for location.
