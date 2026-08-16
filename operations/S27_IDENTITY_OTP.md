# S27 — Identity Auth (split certification)

**Board:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md)

| Gate | Status | Unlocks |
|------|--------|---------|
| **S27A Field-Test Identity** | OPEN — code shipped, not device-certified | S28+ after GREEN |
| **S27B Production SMS OTP** | OPEN — code wired (Twilio Verify); **not GREEN** until real-phone evidence | Public launch SMS proof |

Do **not** mark S27 “production SMS GREEN” while using field-test OTP.  
Do **not** mark **S27B GREEN** until a real handset receives a Twilio Verify SMS and completes the Evidence Pack below.  
Do **not** reopen `x-user-id`, `/dev/seed`, fake users, or `?qa=1` for the Igor path.

## Discipline

| Level | Means |
|-------|--------|
| **CI green** | Code/tests healthy |
| **S27A GREEN** | Physical proof below with field-test auth — no developer bypass |
| **S27B GREEN** | Real Twilio Verify SMS on production domain + Evidence Pack |
| **OPEN** | Any checklist item fails |
| **BLOCKED** | External infra (Twilio/credentials) prevents **S27B** only |

A Vercel deploy alone never closes S27A/S27B.

---

## S27A — Field-Test Identity (NEXT for Igor)

**Intent:** Real E.164 numbers as identities + real Bearer sessions + allow-list + fixed OTP, **without** claiming SMS delivery.

### Env (Vercel Production — not in source)

```bash
AUTH_ALLOW_DEV=false
AUTH_FIELD_TEST_MODE=true
FIELD_TEST_OTP_CODE=482913          # Sensitive
FIELD_TEST_PHONE_ALLOWLIST=+352…,+352…
AUTH_DEBUG_OTP=false
AUTH_PEPPER=<strong secret>
# Do not set OTP_PROVIDER=twilio_verify while certifying S27A
```

Never set `AUTH_ALLOW_DEV=true` on the public field-test API.

### Ordered field script

1. Phone A (allow-listed) → Continue → Field test verification → coordinator code → session  
2. Phone B (different allow-listed number) → same → **distinct** `userId`  
3. Kill both apps → reopen → session restored without OTP  
4. Logout A → login again with field-test OTP  
5. Wrong code rejected  
6. Expired challenge rejected (wait TTL / consume)  
7. Resend works (new challenge; still no SMS)  
8. Excess attempts → rate-limit  
9. Non-allow-listed number → `PHONE_NOT_ALLOWED`  
10. Public routes reject `x-user-id`; `/dev/seed` → `DEV_DISABLED`

### Binary criteria (S27A GREEN)

| # | Criterion | ☐ |
|---|-----------|---|
| 1 | Real numbers A + B as identities | |
| 2 | Two distinct PostgreSQL/engine users (no fake ids) | |
| 3 | Auth without `x-user-id` | |
| 4 | Bearer session + kill/reopen | |
| 5 | Logout / login | |
| 6 | Allow-list enforced | |
| 7 | Fixed field-test OTP (expiry / resend / rate-limit still on) | |
| 8 | UI says **Field test verification** — never “SMS sent” | |
| 9 | No fake users / no `?qa=1` required | |

### Evidence Pack — S27A

| Field | Value |
|-------|--------|
| Date (UTC) | |
| API base URL | |
| Client URL | https://wingman-prototype.vercel.app/ |
| Commit | |
| `AUTH_FIELD_TEST_MODE` | `true` |
| `AUTH_ALLOW_DEV` | `false` |
| Device A / B | |
| Number A / B (anonymized) | |
| Tester(s) | |

### Verdict S27A

```text
[ ] S27A GREEN  — identity field-test proven; SMS delivery NOT certified
[ ] S27A OPEN
```

When **S27A GREEN**, S28 may start. S27B stays OPEN until Twilio Verify phone proof.

---

## S27B — Production SMS OTP (Twilio Verify)

**Intent:** Same auth/session protocol as S27A; OTP **generation + SMS delivery + code check** owned by **Twilio Verify**. Wingman keeps rate-limit bookkeeping, sessions, refresh, revoke, device binding.

**Status:** Implementation shipped in repo — **S27B remains OPEN** until Evidence Pack is filled with real-phone proof. Do **not** promote product status without that evidence.

### Ops prerequisites (credentials never in git)

1. Reuse the same Twilio **account** across projects if desired (Account SID is account-scoped).
2. In Twilio Console → **Verify** → create a **Verify Service** (SMS channel).
3. Copy **Verify Service SID** (`VA…`) — this is **not** the Account SID and **not** a From number.
4. Set secrets only in **Vercel Production** for `wingman-api` (never commit).

### Env (Vercel Production — replace field-test)

```bash
AUTH_FIELD_TEST_MODE=false
AUTH_ALLOW_DEV=false
AUTH_DEBUG_OTP=false
AUTH_PEPPER=<strong secret>

OTP_PROVIDER=twilio_verify
TWILIO_ACCOUNT_SID=<from Twilio console — never commit>
TWILIO_AUTH_TOKEN=<from Twilio console — never commit>
TWILIO_VERIFY_SERVICE_SID=<VA… Verify Service SID — never commit>
```

**Not required for Verify OTP:** `TWILIO_FROM_E164` / From number (Verify Service owns messaging).  
**Optional / separate:** `SMS_PROVIDER=twilio` + `TWILIO_FROM_E164` remain for Programmable SMS (non-OTP) if used elsewhere — independent of S27B.

Unset or leave empty for S27B: `FIELD_TEST_OTP_CODE`, `FIELD_TEST_PHONE_ALLOWLIST`.

### Expected production flow

```text
phone → E.164 validate → POST /auth/otp/request
  → AuthService external challenge (rate-limit)
  → Twilio Verify start (SMS)
  → user enters code → POST /auth/otp/verify
  → Twilio Verify check → approved
  → AuthService completeExternalOtp → Bearer + refresh
  → kill/reopen restores session (refresh / stored tokens)
```

### Ordered certification script (real handset)

1. Production API with env above; `GET /auth/mode` → `fieldTest: false`, `otpProvider: "twilio_verify"`, `authAllowDev: false`
2. Phone A (real E.164) → Continue → **SMS arrives** from Twilio Verify → enter code → session
3. Phone B (different real number) → same → **distinct** `userId`
4. Kill both apps → reopen → session restored without OTP
5. Logout A → request OTP again → new SMS → login
6. Wrong code → `OTP_INVALID`
7. Expired / canceled verification → `OTP_EXPIRED` (or invalid after TTL)
8. Resend → new SMS / new challenge
9. Excess requests/checks → `OTP_RATE_LIMITED` (Wingman and/or Twilio caps)
10. Public routes reject `x-user-id`; `/dev/seed` → `DEV_DISABLED`
11. Confirm HTTP responses and server logs never contain OTP codes, Auth Token, or raw phone numbers

### Binary criteria (S27B GREEN — all required)

| # | Criterion | ☐ |
|---|-----------|---|
| 1 | Real SMS delivered to handset A via Twilio Verify | |
| 2 | Correct code → Bearer session (no `x-user-id`) | |
| 3 | Distinct user for phone B | |
| 4 | Kill/reopen session restore | |
| 5 | Logout / login with new SMS | |
| 6 | Wrong / expired / resend / rate-limit proven against **delivered** codes | |
| 7 | UI may say SMS sent (real delivery) — not field-test copy | |
| 8 | `AUTH_FIELD_TEST_MODE=false`, `AUTH_ALLOW_DEV=false`, `AUTH_DEBUG_OTP=false` | |
| 9 | No secrets in repo / responses / logs | |

### Evidence Pack — S27B

| Field | Value |
|-------|--------|
| Date (UTC) | |
| API base URL | |
| Client URL | |
| Commit | |
| `OTP_PROVIDER` | `twilio_verify` |
| `AUTH_FIELD_TEST_MODE` | `false` |
| `AUTH_ALLOW_DEV` | `false` |
| Twilio Verify Service | configured (SID **not** pasted here) |
| Device A / B | |
| Number A / B (anonymized) | |
| SMS received (yes/no) | |
| Tester(s) | |

### Verdict S27B

```text
[ ] S27B GREEN  — real Twilio Verify SMS proven (Evidence Pack complete)
[x] S27B OPEN   — code may be shipped; phone evidence missing or incomplete
[ ] S27B BLOCKED — provider/infra (no Verify Service / credentials / Twilio outage)
```

---

## Code shipped (CI only)

- `AUTH_FIELD_TEST_MODE` + allow-list + `FIELD_TEST_OTP_CODE` in `@wingman/auth` / `OtpDeliveryService` (S27A)
- `OTP_PROVIDER=twilio_verify` → `TwilioVerifyProvider` start/check; `AuthService` external challenge + `completeExternalOtp` (S27B wiring)
- E.164 validation via `assertValidPhoneE164` before provider calls
- Twilio Verify errors mapped to `OTP_INVALID` / `OTP_EXPIRED` / `OTP_RATE_LIMITED` / `PHONE_INVALID`
- `GET /auth/mode` exposes `{ fieldTest, otpProvider, authAllowDev }`
- Public prod: no `x-user-id`; `/dev/seed` forbidden without `AUTH_ALLOW_DEV`
- **S27B not GREEN** until Evidence Pack above is filled

## Later

Watch **one active connection per user** during S29+. Persistence durability = **S28**.  
Phone + email identity = future; phone-only is intentional for S27B.
