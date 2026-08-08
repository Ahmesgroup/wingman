# Audit Logs

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Every sensitive admin action (evidence view/decrypt, phone decryption, account restriction, privacy action) is
logged with actor, reason, timestamp, and target. Logs are tamper-evident and access-controlled; they never contain
the sensitive payloads themselves.
