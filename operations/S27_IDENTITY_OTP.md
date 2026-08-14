# S27 — Identity Auth (split certification)

**Board:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md)

| Gate | Status | Unlocks |
|------|--------|---------|
| **S27A Field-Test Identity** | OPEN — code shipped, not device-certified | S28+ after GREEN |
| **S27B Production SMS OTP** | OPEN — deferred (Twilio later) | Public launch SMS proof |

Do **not** mark S27 “production SMS GREEN” while using field-test OTP.  
Do **not** reopen `x-user-id`, `/dev/seed`, fake users, or `?qa=1` for the Igor path.

## Discipline

| Level | Means |
|-------|--------|
| **CI green** | Code/tests healthy |
| **S27A GREEN** | Physical proof below with field-test auth — no developer bypass |
| **S27B GREEN** | Real SMS provider delivery on production domain |
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

When **S27A GREEN**, S28 may start. S27B stays OPEN until Twilio.

---

## S27B — Production SMS OTP (later)

Real SMS provider (Twilio Verify or equivalent), production domain, wrong/expired/resend/rate-limit against **delivered** codes.

### Env (replace field-test)

```bash
AUTH_FIELD_TEST_MODE=false
AUTH_ALLOW_DEV=false
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=…
TWILIO_AUTH_TOKEN=…
TWILIO_FROM_E164=…
AUTH_DEBUG_OTP=false
```

Architecture: same auth protocol; delivery switches from field-test path to `SmsProvider` (Twilio). Product OTP UX unchanged except copy (“SMS sent” only when SMS is real).

### Verdict S27B

```text
[ ] S27B GREEN  — real SMS delivery proven
[ ] S27B OPEN
[ ] S27B BLOCKED — provider/infra
```

---

## Code shipped (CI only)

- `AUTH_FIELD_TEST_MODE` + allow-list + `FIELD_TEST_OTP_CODE` in `@wingman/auth` / `OtpDeliveryService`
- No SMS when field-test; challenge + expiry + rate-limit retained
- `GET /auth/mode` exposes `{ fieldTest }`
- Client field-test copy; no fake “SMS sent”
- Public prod: no `x-user-id`; `/dev/seed` forbidden without `AUTH_ALLOW_DEV`

## Later

Watch **one active connection per user** during S29+. Persistence durability = **S28**.
