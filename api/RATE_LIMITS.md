# Rate Limits

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Per user + per action, enforced at edge and API with Redis counters. Examples: OTP requests (tight, per phone +
per IP), Radar candidate reads (throttled — anti-scraping), Signal sends (quota-bound + burst limit), report
submission (abuse-resistant), payment endpoints (idempotency-keyed). Limits return `AUTH_RATE_LIMITED` /
`*_RATE_LIMITED` with retry hints. No sensitive endpoint ships without a rate limit (AI_CODING_RULES #16).
