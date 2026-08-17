# Product Requirements Document (PRD)

**Product:** Wingman · **Version:** 4.1 · **Status:** Decided · **Owner:** Igor Chernikov
**Positioning:** *From presence to hello.*
**Category:** Real-world connection facilitator
**Related:** `PRODUCT_PRINCIPLES.md`, `SUCCESS_METRICS.md`, `BUSINESS_MODEL.md`, `architecture/STATE_MACHINES.md`

## 1. Overview

Wingman is a real-world connection facilitator. It helps two people who are already near each other safely discover
mutual interest and say hello in real life. It is not a swipe app, profile catalogue, social network, infinite messenger,
or content platform. The product rule: any feature that increases time-in-app without increasing the chance of a
real interaction must be rejected.

Wingman does not help you collect matches. Wingman helps you make the first acquaintance.

Core sequence: `RADAR → SIGNAL → SELFIE (initiator) → SELFIE (recipient) → MUTUAL VALIDATION → TICKET or MISSION
MEET → MISSION MODE → OUTCOME → COOLDOWN → RADAR`. Parallel entry: `DESTINY PROMPT → DESTINY SIGNAL → protocol`.

## 2. Problem

People cross paths with someone they'd like to meet and say nothing — fear of rejection, uncertainty about mutual
interest, no social facilitator, privacy worries. Existing apps solve remote discovery, not the real-world approach.

## 3. Principles (summary; full text in `PRODUCT_PRINCIPLES.md`)

1. Remove hesitation — no explicit rejection; silent expiration only.
2. One connection at a time — an operating rule, not the public slogan.
3. Encourage real meetings — short, single-objective interactions; meetings tracked as an outcome (D-024).
4. Protect privacy — no public photos, no browsing, approximate location only, per-purpose consent.

## 4. User profile

**Required:** first name (shown only after a confirmed match), birth date (age derived; min age 18), gender
(Male/Female/Non-binary), interested in (Men/Women/Non-binary/Everyone-as-a-set), height, ≤5 interests, daily bio
(≤150 chars), current intention (**Available now / Just exploring**), mood.
**Optional:** languages, occupation, education.
**Private:** phone, identity metadata, precise location, device info, consent history.

**Mood dots:** Super ready / Open / Exploring. Mood never overrides visibility, permissions, or safety rules, and
is conveyed by shape + animation as well as color.

## 5. Identity verification

Phone OTP → real-time verification selfie (no gallery import) → on-device liveness → server analysis + token →
**data-exchange consent** step. No feature unlocks before verification **and** consent. Verification media is never
public, never downloadable, and deleted after validation. Liveness scope, biometric handling, and appeal are
specified in `security/SELFIE_SECURITY.md` and `privacy/*` (subject to legal review).

## 6. Onboarding

≤3 minutes to active on Radar: intro (3 slides) → phone+OTP → basic profile → daily bio → verification selfie →
**consent + permissions** → Radar activation.

## 7. Radar

Anonymous dots on an abstract, non-map surface. Modes: Active / Invisible (default) / Mission (hidden). Adaptive
approximate radius (dense 30–50 m, open 100–200 m); exact location never shared. Tapping a dot shows age, height,
bio, interests, availability, mood color — never photo, name, exact location, or token. Candidates exclude blocked,
Mission-mode, cooldown, and incompatible users.

## 8. Signal

Express interest without exposing the other to rejection. Free 2/day, Wingman+ **20–25/day**. One active Signal per
pair. No decline button; silent expiration after 10 minutes. Sources: Radar, Destiny, Rematch.

## 9. Selfie exchange

Sequential, ephemeral: initiator selfie → 5-min window → recipient selfie → 5-min approval window → mutual
validation opens Mission Meet. Real-time capture only, on-device liveness, **timestamped**, non-downloadable via the
app's own UI, opaque media ids, private storage, immediate deletion on expiry. No rejection notification ever. The
"Verified Selfie Cache" (Wingman+/one-time) stores one liveness-checked, timestamped selfie for 24h.

## 10. Mutual validation

PENDING → RESPONSE → CONNECTED → (or EXPIRED, silent). Absolute rule: no rejection notification.

## 11. Connection Ticket

Hold an opportunity. Free 1 active, up to **2h**; Wingman+ 2 active, up to **24h**, 1 renewal. No chat, no contact
exchange, silent expiry. Availability → notify → confirm → Mission Meet (else silent expiry after 15 min).

## 12. Mission Meet

Convert interest into a physical meeting. 15 min (Free) / 20 min (Wingman+), single objective "decide where to meet".
Phone/social/URL/email auto-blocked with a rule reminder. No extension. End: "Let's meet" (→ Mission Mode) /
"Not this time" / silent expiry.

## 13. Mission Mode & Cooldown

During a mission: invisible, no signals in/out, only the Mission Meet screen. Outcome (private, per user):
Yes/No. Cooldown 30 min (≥1 Yes) / 15 min (both No or timeout). Radar read-only during cooldown; manual return.
Cool Down Skip (€0.99) documented with its product/safety trade-off.

## 14. Destiny Connection

Off by default, separate opt-in, pausable. Coarse co-presence over repeated public crossings surfaces a discreet
prompt; standard protocol resumes if both engage. No trajectory, date, address, or exact location shown. Sensitive
feature — DPIA + abuse/stalking review; likely post-V1. Not described as "k-anonymity" (D-020).

## 15. Wingman Pulse

Aggregated, anonymized activity zones (High Opportunity / Electric). No profiles, photos, precise locations, or
identities. Electric notifications are Wingman+ only.

## 16. Push notifications

Signal received, Destiny prompt, selfie received, connection established, ticket activated, partner available,
Mission Meet opened, cooldown over, Electric Pulse nearby. No notification reveals identity, photo, or precise
location.

## 17. Offline behavior

Radar: active 2 min then invisible. Selfie/Mission/Ticket/Cooldown: **server-authoritative** timers keep running;
the client reconciles on reconnect (D-015). No sensitive timer pauses in airplane mode.

## 18. Safety & trust

Report → instant, silent one-way block. Repeated independent reports → human review (no automatic permanent ban).
Report available in ≤2 taps from Radar, selfie exchange, and Mission Meet. Evidence sealed only on report.

## 19. GDPR & data

Per-purpose, append-only, versioned consent. Retention matrix in `database/DATA_RETENTION_MATRIX.md`. Rights:
access, erasure, rectification, portability, consent withdrawal. Designed to support GDPR compliance, subject to
legal review.

## 20. Business model

Freemium. Free: full Radar, 2 signals/day, 1 ticket up to 2h, Pulse visible, Mission Meet 15 min, Destiny, Mood.
Wingman+ €9.99/mo: 20–25 signals/day, 2 tickets up to 24h + renewal, verified selfie cache, dot view count,
discovery priority (increases probability, never guarantees exposure), Pulse notifications, +5 min windows, Mission
Meet 20 min. One-time: Night Pass €2.99, Event Pass €4.99, Verified Selfie €0.99, Rematch €1.99, Cool Down Skip
€0.99. Never: boosted profiles, ads in the meeting flow, monetizing behavioral data.

## 21. Success metrics

North star: **confirmed real-world meetings**, read with acceptance/response/approval rates. See `SUCCESS_METRICS.md`.

## 22. Non-goals

Not a social network, content platform, infinite messenger, profile browser, or swipe app.
