# Security Checklist

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

- [ ] No raw phone/OTP stored or logged
- [ ] HMAC+AES phone protection with key version
- [ ] Server-authoritative timers everywhere
- [ ] ActiveUserLock + partial unique indexes in migrations
- [ ] Rate limits on all sensitive endpoints
- [ ] Idempotency keys on all state-changing + all financial endpoints
- [ ] Selfie: opaque ids, short signed access, no logging, deletion + reconciliation
- [ ] Log redaction verified (phone, selfie, URLs, chat, location, tokens, evidence)
- [ ] Moderation evidence encrypted, referenced, audit-logged
- [ ] No automatic permanent bans
- [ ] Destiny off by default, DPIA before launch
