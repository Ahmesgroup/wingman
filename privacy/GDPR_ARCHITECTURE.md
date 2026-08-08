# GDPR Architecture

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Designed to support GDPR compliance (subject to legal review). Distinguishes legal bases: **contractual necessity**
(core matching, protocol operation), **consent** (coarse location, Destiny, push, analytics), **legitimate interest**
(safety/anti-abuse, some minimal metrics), **legal obligations** (accounting, certain safety records). Purposes,
retention, access, deletion, export, and consent withdrawal are documented per data category in
`../database/DATA_RETENTION_MATRIX.md`.
