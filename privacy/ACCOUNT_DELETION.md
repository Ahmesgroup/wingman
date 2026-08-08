# Account Deletion

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Deletion removes personal data within 72h. Some records may need short, lawful retention (e.g., accounting;
demonstrating consent compliance; open safety cases) — this is a **legal decision**, not silently encoded via schema
cascades. The deletion worker removes profile, devices, ephemeral state, and schedules purges; it records completion
in `PrivacyRequest`. Consent-proof retention is decided with legal counsel.
