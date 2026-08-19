# S27 — Identity Auth (split certification)

**Board:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md)  
**Product DoD:** Testers open **only** https://wingman-prototype.vercel.app/ — no Nest URL, no `?api=`, no `?qa=1`, no `x-user-id`, no `/dev/seed`, no fixed Twilio OTP in production Verify mode.

| Gate | Status | Unlocks |
|------|--------|---------|
| **S27A Field-Test Identity** | OPEN — code shipped, not device-certified | S28+ after GREEN |
| **S27B Production SMS OTP** | OPEN — Twilio Verify + web product path wired; **not GREEN** until real SMS via **website** | Public launch SMS proof |

Do **not** mark S27 “production SMS GREEN” while using field-test OTP.  
Do **not** mark **S27B GREEN** until a real handset receives a Twilio Verify SMS **through the public site** and completes the Evidence Pack below.  
Do **not** reopen `x-user-id`, `/dev/seed`, fake users, or `?qa=1` for the Igor product path.  
Do **not** treat `GET /auth/mode` or API URLs as tester steps — those are internal controls.

## Discipline

| Level | Means |
|-------|--------|
| **CI green** | Code/tests healthy |
| **S27A GREEN** | Physical proof below with field-test auth — no developer bypass |
| **S27B GREEN** | Real Twilio Verify SMS on **public website** + Evidence Pack |
| **OPEN** | Any checklist item fails |
| **BLOCKED** | External infra (Twilio/credentials) prevents **S27B** only |

A Vercel deploy alone never closes S27A/S27B.

---

## Product path (Igor / real testers)

```text
Open https://wingman-prototype.vercel.app/
  → Enter phone → Send code
  → SMS arrives (Twilio Verify when S27B) OR coordinator code (S27A field-test only)
  → Enter OTP → session
  → Kill/reopen browser → still you
  → Radar → Signal → …
```

**Forbidden for product certification**

- `wingman-prototype.vercel.app/?api=https://…`
- `?qa=1` / Smoke / Offline labs
- Fixed OTP `482913` while API is in Twilio Verify production mode
- `x-user-id`, fake users, `/dev/seed`
- Manual DB / DevTools / Codex as required steps

**Client config (ops only — not a tester step)**

| Project | Env | Value |
|---------|-----|--------|
| `wingman-prototype` | `WINGMAN_API_URL` | `https://wingman-api-three.vercel.app` (or current production API) |

Baked at build into `config.js`. See [`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md).

---

## S27A — Field-Test Identity (NEXT for Igor)

**Intent:** Real E.164 numbers as identities + real Bearer sessions + allow-list + fixed OTP, **without** claiming SMS delivery. Still certified **via the website**, not by curling the API.

### Env (Vercel Production API — not in source)

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

### Ordered field script (browser product)

1. Open public site (no query params) on phone A (allow-listed) → Continue → phone → field-test copy → coordinator code → session  
2. Phone B (different allow-listed number) → same → **distinct** user  
3. Kill both browsers → reopen → session restored without OTP  
4. Logout A → login again with field-test OTP  
5. Wrong code rejected  
6. Expired challenge rejected (wait TTL / consume)  
7. Resend works (new challenge; still no SMS)  
8. Excess attempts → rate-limit  
9. Non-allow-listed number → rejected in UI  
10. (Internal) Public routes reject `x-user-id`; `/dev/seed` → `DEV_DISABLED`

### Binary criteria (S27A GREEN)

| # | Criterion | ☐ |
|---|-----------|---|
| 1 | Real numbers A + B as identities **via website** | |
| 2 | Two distinct users (no fake ids) | |
| 3 | Auth without `x-user-id` | |
| 4 | Bearer session + kill/reopen | |
| 5 | Logout / login | |
| 6 | Allow-list enforced | |
| 7 | Fixed field-test OTP (expiry / resend / rate-limit still on) | |
| 8 | UI says **Field test verification** — never “SMS sent” | |
| 9 | No fake users / no `?qa=1` / no `?api=` required | |

### Evidence Pack — S27A

| Field | Value |
|-------|--------|
| Date (UTC) | |
| Client URL | https://wingman-prototype.vercel.app/ |
| Commit | |
| `AUTH_FIELD_TEST_MODE` | `true` |
| `AUTH_ALLOW_DEV` | `false` |
| Device A / B | |
| Number A / B (anonymized) | |
| Tester(s) | |

### Verdict S27A

```text
[ ] S27A GREEN  — identity field-test proven via website; SMS delivery NOT certified
[ ] S27A OPEN
```

When **S27A GREEN**, S28 may start. S27B stays OPEN until Twilio Verify phone proof **via website**.

---

## S27B — Production SMS OTP (Twilio Verify) — browser product test

**Intent:** Same auth/session protocol as S27A; OTP **generation + SMS delivery + code check** owned by **Twilio Verify**. Wingman keeps rate-limit bookkeeping, sessions, refresh, revoke, device binding. Certification is **opening the public site only**.

**Status:** Implementation shipped in repo — **S27B remains OPEN** until Evidence Pack is filled with real-phone proof **through the website**. Do **not** promote product status without that evidence.

### Fraud Guard 60410 (field testers, Luxembourg `+352`)

If Send code succeeds in the API but **no SMS** arrives, and Twilio shows **60410**, Fraud Guard has **prefix-blocked** the destination (often `+352`) for ~12 hours. **Do not** disable Fraud Guard. **Do not** open Verify Geo Permissions globally.

Ops: Safe List **only** authorized field-test E.164s (`+352XXXXXXXX`) on the **Verify** Service **`VA…`** (not Conversations **`IS…`**). Exact Console clicks: [`FIELD_TEST_OTP_SAFE_LIST.md`](./FIELD_TEST_OTP_SAFE_LIST.md).

**PRODUCT PROTOCOL READY: NO** until the Evidence Pack below is filled.

### Ops prerequisites (credentials never in git)

1. Reuse the same Twilio **account** across projects if desired (Account SID is account-scoped).
2. In Twilio Console → **Verify** → create a **Verify Service** (SMS channel).
3. Copy **Verify Service SID** (`VA…`) — this is **not** the Account SID and **not** a From number.
4. Set secrets only in **Vercel Production** for `wingman-api` (never commit).
5. Set `WINGMAN_API_URL` on **wingman-prototype** Production (+ Preview if needed); redeploy prototype.

### Env (Vercel Production API — replace field-test)

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

If `TWILIO_AUTH_TOKEN` is missing → **S27B BLOCKED** for real SMS (do not invent token). API stays up; Send code fails with a clear unavailable error until the token is set on `wingman-api`.

### Expected production flow (user-visible)

```text
Open Wingman site
  → phone screen → Send code
  → (API behind scenes) Twilio Verify SMS
  → OTP screen → enter real code
  → authenticated session → kill/reopen restores user
```

### Ordered certification script (real handset + public URL only)

1. Open https://wingman-prototype.vercel.app/ with **no** `?api=` / `?qa=`  
2. Walk to phone entry → Send code → **SMS arrives** from Twilio Verify → enter code → session  
3. Second phone / browser with different number → **distinct** user  
4. Kill both → reopen → session restored without OTP  
5. Logout A → request OTP again → new SMS → login  
6. Wrong code rejected in UI  
7. Resend → new SMS  
8. UI may say SMS sent (real delivery) — **not** field-test copy  
9. (Internal ops) Confirm `AUTH_FIELD_TEST_MODE=false`, no secrets in repo/logs, fixed OTP not accepted

### Binary criteria (S27B GREEN — all required)

| # | Criterion | ☐ |
|---|-----------|---|
| 1 | Real SMS delivered to handset A via Twilio Verify **from website Send code** | |
| 2 | Correct code → Bearer session (no `x-user-id`) | |
| 3 | Distinct user for phone B | |
| 4 | Kill/reopen session restore | |
| 5 | Logout / login with new SMS | |
| 6 | Wrong / expired / resend / rate-limit proven against **delivered** codes | |
| 7 | UI may say SMS sent (real delivery) — not field-test copy | |
| 8 | `AUTH_FIELD_TEST_MODE=false`, `AUTH_ALLOW_DEV=false`, `AUTH_DEBUG_OTP=false` | |
| 9 | No secrets in repo / responses / logs | |
| 10 | No `?api=` / `?qa=` required for tester | |

### Evidence Pack — S27B

| Field | Value |
|-------|--------|
| Date (UTC) | |
| Client URL | https://wingman-prototype.vercel.app/ |
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
[ ] S27B GREEN  — real Twilio Verify SMS proven via website (Evidence Pack complete)
[x] S27B OPEN   — Twilio Auth Token present on wingman-api Production; OTP start succeeds; phone SMS evidence via website still missing
[ ] S27B BLOCKED — provider/infra (TWILIO_AUTH_TOKEN missing on wingman-api Production; Verify SID/Account SID/OTP_PROVIDER set)
```

---

## S28–S34 (browser product tests — summary)

| Sprint | Product proof (website only) |
|--------|------------------------------|
| **S28** | Two users, two browsers/phones, remain distinct after refresh/close/redeploy |
| **S29** | A signals B on public site; B receives without DB hack |
| **S30** | Real session presence on Radar — not demo data |
| **S31** | Mobile camera → capture → private upload → protocol-only visibility → expiration |
| **S32** | Closed/background behavior where web/PWA allows |
| **S33** | Block/report/rate limits on real user path |
| **S34** | People get only the Wingman link and complete protocol without knowing Nest/API/`?api=` |

None of S27B–S34 are GREEN without evidence. API endpoints are internal controls, not tester steps.

---

## Code shipped (CI only)

- `AUTH_FIELD_TEST_MODE` + allow-list + `FIELD_TEST_OTP_CODE` in `@wingman/auth` / `OtpDeliveryService` (S27A)
- `OTP_PROVIDER=twilio_verify` → `TwilioVerifyProvider` start/check; `AuthService` external challenge + `completeExternalOtp` (S27B wiring)
- Prototype: `WINGMAN_API_URL` → `config.js`; public product path ignores `?api=` unless localhost/`?qa=1`
- E.164 validation via `assertValidPhoneE164` before provider calls
- Twilio Verify errors mapped to `OTP_INVALID` / `OTP_EXPIRED` / `OTP_RATE_LIMITED` / `PHONE_INVALID`
- `GET /auth/mode` exposes `{ fieldTest, otpProvider, authAllowDev }` (**ops/debug**, not a product screen)
- Public prod: no `x-user-id`; `/dev/seed` forbidden without `AUTH_ALLOW_DEV`
- **S27B not GREEN** until Evidence Pack above is filled via **website**

## Later

Watch **one active connection per user** during S29+. Persistence durability = **S28**.  
Phone + email identity = future; phone-only is intentional for S27B.
