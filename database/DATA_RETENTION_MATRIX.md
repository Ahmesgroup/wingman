# Data Retention Matrix

**Status:** Decided (V4.1) · Legal review required before launch.

| Data category | Purpose | Legal basis | Storage | Retention | Access | Deletion trigger | Exported? | Sensitive? |
|---|---|---|---|---|---|---|---|---|
| Profile | Matching | Contract | PostgreSQL | While account active | User, matched peers (limited) | Account deletion | Yes | No |
| Phone (HMAC + ciphertext) | Verify, anti-fraud | Contract/legal | PostgreSQL | While account active | System, support (audited) | Account deletion | Partial | Yes |
| Session | Auth | Contract | PostgreSQL/Redis | Session lifetime | System | Expiry/logout | No | No |
| Device/push token | Notifications | Consent | PostgreSQL | While registered | System | Unregister/deletion | No | No |
| Consent events | Compliance | Legal | PostgreSQL (append-only) | Per legal decision | DPO, system | Legal policy | Yes | No |
| Ephemeral location | Radar/Destiny | Consent | Redis | Seconds–minutes | System | TTL/heartbeat | No | Yes |
| Signal | Protocol | Contract | PostgreSQL + Redis | 30 days (logs) | System | purgeAt | Minimal | No |
| Selfie | Validation | Contract | Private storage | Session only | Recipient (short) | Expiry/validation | No | Yes |
| Mission chat | Meet coordination | Contract | Redis | ≤25 min | Participants | Close/expiry | No | Yes |
| Mission outcome | Cooldown/metrics | Contract/legit. interest | PostgreSQL | 30 days | System | purgeAt | Minimal | No |
| Block | Safety | Legit. interest | PostgreSQL | While relevant | System | Account deletion | Minimal | No |
| Report | Safety | Legit. interest/legal | PostgreSQL | Case-dependent | Moderators | Case close + policy | No | Yes |
| Moderation evidence | Safety | Legit. interest/legal | Encrypted storage | purgeAt | Authorized (audited) | purgeAt | No | Yes |
| Payment | Billing | Contract/legal | PostgreSQL/PSP | Legal (accounting) | System, finance | Legal period | Partial | No |
| Destiny candidate | Serendipity | Consent | Redis/PostgreSQL | Short TTL (48h) | System | purgeAt | No | Yes |
| Analytics | Improvement | Consent | Analytics store | Aggregated | System | Opt-out/policy | No | No |

We never assert automatic "GDPR compliant"; the product is *designed to support GDPR compliance, subject to legal
review, operational controls, vendor agreements and launch-country validation.*
