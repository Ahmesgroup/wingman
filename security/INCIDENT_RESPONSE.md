# Incident Response

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Runbook-driven. Detect (alerts on purge lag, media-deletion failures, moderation spikes, auth anomalies) → contain
(revoke sessions/keys, disable affected feature flags) → eradicate → recover → post-mortem. Data-breach handling
follows GDPR notification duties (timelines confirmed with legal). Rotate the phone pepper/encryption keys on
suspected compromise using `phoneKeyVersion`.
