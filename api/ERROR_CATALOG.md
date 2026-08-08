# Error Catalog

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Stable machine-readable codes. Examples: `AUTH_OTP_INVALID`, `AUTH_OTP_EXPIRED`, `AUTH_RATE_LIMITED`,
`PROFILE_UNDERAGE`, `CONSENT_REQUIRED`, `SIGNAL_QUOTA_EXCEEDED`, `SIGNAL_PAIR_ACTIVE`, `SIGNAL_BLOCKED`,
`CONNECTION_USER_BUSY` (ActiveUserLock), `WINDOW_EXPIRED`, `NOT_A_PARTICIPANT`, `CONTACT_BLOCKED`,
`IDEMPOTENCY_REPLAY`, `PAYMENT_IDEMPOTENCY_REQUIRED`. Errors explain what happened and how to proceed; they never
reveal that another user declined (silent-expiry rule).
