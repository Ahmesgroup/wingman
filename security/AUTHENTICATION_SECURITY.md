# Authentication Security

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Phone OTP with hashed codes, attempt caps, and tight rate limits. Sessions are opaque tokens stored hashed
(`tokenHash`), with expiry and revocation; bound to a device. Sensitive endpoints require a verified account.
No raw phone or OTP is ever logged.
