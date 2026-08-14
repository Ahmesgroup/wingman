# S27 — Production Identity & Real Phone Auth

**Status:** OPEN — implementation shipped (`af29101`), **not product-certified**  
**Board:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md)  
**S28:** BLOCKED until this sprint is **GREEN** (no parallel work)

## Discipline

| Level | Means |
|-------|--------|
| **CI green** | Code/tests healthy (`af29101` and later) |
| **S27 GREEN** | Full physical-phone proof below — no developer bypass |
| **S27 OPEN** | Any single checklist item fails (even if CI is green) |
| **S27 BLOCKED** | External infra prevents the test (Twilio/credentials/SMS unreachable) — **not** a product bug |

A Vercel deploy alone never closes S27.  
No new functional development until field evidence, unless a **reproducible** defect appears.

## Ordered field script (unique sequence)

1. Phone A enters real number → real SMS → enters code → session created  
2. Phone B repeats → two **distinct** identities  
3. Full kill of both apps/PWA → reopen → session restored **without** OTP  
4. Logout A → login again with OTP  
5. Wrong code rejected  
6. Expired code rejected  
7. Resend works  
8. Excessive attempts → rate-limit  
9. Confirm public routes reject `x-user-id` and `/dev/seed`  

## Binary criteria (all required for GREEN)

| # | Criterion | Device proof |
|---|-----------|--------------|
| 1 | Real number A + B | ☐ |
| 2 | Real OTP via SMS provider | ☐ |
| 3 | No `x-user-id` / no public `/dev/seed` | ☐ |
| 4 | Wrong OTP rejected | ☐ |
| 5 | Expired OTP rejected | ☐ |
| 6 | Resend works | ☐ |
| 7 | Rate-limit works | ☐ |
| 8 | Session after kill/reopen | ☐ |
| 9 | Logout → login again | ☐ |
| 10 | Two independent identities restored | ☐ |

## S27 Evidence Pack (next useful deliverable)

Fill one pack per certification attempt. Anonymize numbers (e.g. `+352***…789`).

| Field | Value |
|-------|--------|
| Date (UTC) | |
| API base URL | |
| Client URL | https://wingman-prototype.vercel.app/ (or build SHA) |
| Commit under test | `af29101` or later |
| SMS provider | Twilio / other |
| `AUTH_ALLOW_DEV` | must be `false` on public API |
| Device A (model / OS / browser) | |
| Device B (model / OS / browser) | |
| Number A (anonymized) | |
| Number B (anonymized) | |
| Tester(s) | |

### Scenario log

| Step | Expected | Observed | Timestamp (UTC) | Evidence (screenshot / log id) | PASS/FAIL |
|------|----------|----------|-----------------|--------------------------------|-----------|
| A request OTP | SMS received | | | | |
| A verify OTP | Session created | | | | |
| B request + verify | Distinct `userId` from A | | | | |
| Kill both apps | — | | | | |
| Reopen A + B | Session without OTP | | | | |
| Logout A | Session cleared | | | | |
| Login A again | OTP required + success | | | | |
| Wrong OTP | Rejected | | | | |
| Expired OTP | Rejected | | | | |
| Resend | New SMS / usable code | | | | |
| Rate-limit | Blocked after excess | | | | |
| `x-user-id` on protected route | 401 | | | | |
| `POST /dev/seed` | 403 DEV_DISABLED | | | | |

### Verdict

```text
[ ] S27 GREEN   — all steps PASS, dated evidence attached, no bypass
[ ] S27 OPEN    — at least one FAIL (product/path defect)
[ ] S27 BLOCKED — infra/provider prevented the run (describe below)
```

Infra blocker notes (if BLOCKED):  

---

When the pack is entirely **GREEN**, S28 may move from **BLOCKED → ACTIVE**. Not before.

## Code shipped (CI only — does not certify)

- OTP in SMS via `deliveryCode`; HTTP never returns code unless `AUTH_DEBUG_OTP`
- Public prod: no `x-user-id`; `/dev/seed` forbidden without `AUTH_ALLOW_DEV`
- Client: phone → OTP → Bearer session + localStorage restore
- Local dual-user seed only on localhost / `?devauth=1`

## Public API config for the evidence run

```bash
NODE_ENV=production          # or WINGMAN_PUBLIC_PROD=true
AUTH_ALLOW_DEV=false
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=…
TWILIO_AUTH_TOKEN=…
TWILIO_FROM_E164=…
AUTH_PEPPER=<strong secret>
AUTH_DEBUG_OTP=false
```

## Later sprints

Keep watching **one active connection per user** (`ActiveUserLock` / engine locks + DB invariant) during S29+. That rule is persistence-backed, not UI-only.
