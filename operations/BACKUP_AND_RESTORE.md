# Backup & Restore

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

PostgreSQL: encrypted EU backups with tested restore. Redis sensitive namespaces are **not** backed up (policy);
non-sensitive operational data may be. Object storage relies on lifecycle + reconciliation, not long-term backup of
selfies. Restore runbooks verify integrity and retention obligations.
