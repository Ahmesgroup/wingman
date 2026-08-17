# Two-phone Evidence Pack — Wingman protocol

**V3.1 is owner-locked authority. PRODUCT PROTOCOL READY requires every row PASS without developer assistance.**  
Never record OTP codes, tokens, or full phone numbers in shared docs.

| # | Step | Device | OS | Browser/PWA | Timestamp (UTC) | Expected | Observed | PASS/FAIL |
|---|------|--------|----|-------------|-----------------|----------|----------|-----------|
| 1 | OTP request + verify (A) | | | | | Session created; no `x-user-id` | | |
| 2 | OTP request + verify (B) | | | | | Distinct userId from A | | |
| 3 | Profile save (A) | | | | | Survives app kill + reopen | | |
| 4 | Profile save (B) | | | | | Survives app kill + reopen | | |
| 5 | Consent → Radar | | | | | Next CTA not under keyboard | | |
| 6 | Radar alone | | | | | nearby=0, empty copy | | |
| 7 | Both active nearby | | | | | Each sees the other (no ghosts) | | |
| 8 | Signal A→B | | | | | B receives **without refresh** | | |
| 9 | Accept → selfie | | | | | Connection shared; correct roles | | |
| 10 | Selfie A | | | | | Camera-only; opaque media; peer-only | | |
| 11 | Selfie B | | | | | Same; bound to connection | | |
| 12 | Mutual approve | | | | | Both advance without refresh | | |
| 13 | Mission Meet chat | | | | | A↔B live; anti-contact; no cross-conn | | |
| 14 | Reconnect mid-chat | | | | | History restored | | |
| 15 | Mission Mode → Outcome | | | | | Both sides record own outcome | | |
| 16 | Cooldown → Radar | | | | | Invisible/cooldown then return | | |

**Infra prerequisites before claiming durable PASS:** Production `/internal/ready` shows Postgres persistence + Redis ephemeral (not `memory` / `not-configured`).

## Current status

All V3.1 rows are **NOT STARTED** as of 2026-08-17. Automated tests and infrastructure checks can establish wiring
only; they do not populate a PASS row or make **PRODUCT PROTOCOL READY** green. Record a reproducible observation in
every column before deciding PASS/FAIL.

## S35 V2 A/B observations — separate and not readiness evidence

S35 is an opt-in experiment only (`PRODUCT_PROTOCOL_V2_ENABLED=false` by default) and cannot replace the V3.1 Evidence
Pack. Run this table only after all V3.1 rows pass with two real users. Never record identity, OTP, token, selfie, or
exact location data.

| Participant pseudonym | Device/browser | Timestamp (UTC) | Variant (V1/V2) | Expected | Observed | Completion / safety notes | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| | | | | Private, silent, anti-contact flow understood; no developer assistance | NOT RUN | | |

V2's user-facing sequence is `RADAR → SELFIE SIGNAL → SELFIE RESPONSE → MUTUAL → MISSION → OUTCOME → COOLDOWN`. Its Signal, Selfie, and Connection backend domains remain separate. Criteria are in [`S35_PRODUCT_PROTOCOL_V2.md`](./S35_PRODUCT_PROTOCOL_V2.md).
