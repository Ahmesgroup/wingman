# Admin Security

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Admin dashboard is least-privilege and strongly authenticated (SSO + MFA recommended). Roles separate moderation,
identity review, and privacy operations. Every access to evidence, phone decryption, or personal data is
audit-logged. Admin actions on accounts (suspend/ban) are recorded in `ModerationAction` and reviewable.
