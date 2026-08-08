# Moderation Security

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Ordinary Mission Meet messages are deleted on close. When a user reports during a session, the strictly necessary
items are sealed into an **encrypted evidence object stored outside PostgreSQL**; `ModerationEvidence` holds only a
reference, key ref, integrity hash, and `purgeAt`. Decryption requires authorization and writes a
`ModerationAuditLog` entry (who, why, when, what). No automatic permanent bans; permanent actions are human-reviewed
and auditable.
