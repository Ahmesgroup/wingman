# Environment Variables

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`DATABASE_URL`, `REDIS_URL`, `PHONE_LOOKUP_PEPPER`, `PHONE_ENC_KEY` (+ `PHONE_KEY_VERSION`), `MEDIA_BUCKET`,
`MEDIA_KMS_KEY`, `SESSION_SIGNING_KEY`, push provider keys, PSP keys, `POLICY_VERSION`. Secrets are managed via a
secret store, never committed; peppers/keys rotate via versioning.
