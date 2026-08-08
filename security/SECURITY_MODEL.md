# Security Model

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Defense in depth: verified accounts, per-purpose consent, least-privilege admin, encrypted sensitive media, HMAC+AES
phone protection, server-authoritative timers, atomic transitions, rate limits, and strict log redaction. The
protocol's safety properties (who sees whom, who can report whom, in what state, for how long, what happens to each
datum after expiry) are the primary security surface.
