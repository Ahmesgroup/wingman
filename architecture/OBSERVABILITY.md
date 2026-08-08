# Observability

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Structured logs, traces, metrics — with strict redaction: never log raw phone, selfie bytes/URLs, signed URLs,
Mission Meet messages, precise location, tokens, or evidence (AI_CODING_RULES #9). Key metrics: signal funnel,
selfie response, mission confirmation, meeting outcome, report rate, timer-expiry counts, purge job health, media
deletion success. Alerts on purge lag, media-deletion failures, and moderation queue growth.
