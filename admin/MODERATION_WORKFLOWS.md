# Moderation Workflows

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Reports create/append `ModerationCase`. Repeated independent reports raise priority and may trigger a temporary
`AccountRestriction` in severe cases — never an automatic permanent ban. Moderators can view sealed evidence only
with authorization; every view/decrypt writes `ModerationAuditLog`. Actions (warn/suspend/ban/dismiss) are recorded
in `ModerationAction`. Coordinated false-report patterns are flagged and can lead to dismissal.
