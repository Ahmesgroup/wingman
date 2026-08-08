# Auth Api

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

`POST /auth/otp/request` (rate-limited, creates OtpChallenge with codeHash, TTL) and `POST /auth/otp/verify` (checks hash, attempts; issues session token stored hashed). No raw phone or code is ever stored or logged. Idempotent verify.

Each endpoint documents method, path, auth, rate limit, body, response, errors, idempotency key, PostgreSQL effects, Redis effects, WebSocket events, notifications, and audit — per `API_OVERVIEW.md`.
