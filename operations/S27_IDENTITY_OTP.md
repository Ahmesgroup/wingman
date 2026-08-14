# S27 — Production Identity & Real Phone Auth

**Status:** OPEN (implementation in progress — not GREEN)  
**Board:** [`LIVE_FIELD_TEST.md`](./LIVE_FIELD_TEST.md)  
**Rule:** binary — GREEN only with full phone proof; otherwise stays OPEN. **S28 blocked.**

## Levels

| Level | Meaning |
|-------|---------|
| CI green | Code/tests healthy |
| Sprint green (S27) | All binary items proven on **physical phones** |
| S34 green | Full multi-human protocol |

Vercel deploy alone never closes S27.

## Binary checklist (phone proof)

| # | Criterion | Code path | Device proof |
|---|-----------|-----------|--------------|
| 1 | Real number A + B | Client OTP UI | ☐ |
| 2 | Real OTP via SMS provider | `OtpDeliveryService` + Twilio/`SMS_PROVIDER` | ☐ |
| 3 | No `x-user-id` on public prod | `main.ts` forces off when `production` / `WINGMAN_PUBLIC_PROD` | ☐ |
| 4 | Wrong OTP rejected | `AuthService.verifyOtp` → OTP_INVALID | ☐ |
| 5 | Expired OTP rejected | OTP_EXPIRED | ☐ |
| 6 | Resend works | re-`POST /auth/otp/request` + UI Resend | ☐ |
| 7 | Rate-limit works | OTP_RATE_LIMITED | ☐ |
| 8 | Session after kill/reopen | tokens in localStorage + refresh | ☐ |
| 9 | Logout → login | `/auth/logout` + re-verify | ☐ |
| 10 | Two independent identities | `ensureUser` per phone | ☐ |

## Shipped in code (not yet Sprint GREEN)

- SMS body always includes OTP (`deliveryCode`); HTTP never returns it unless `AUTH_DEBUG_OTP`
- `AUTH_ALLOW_DEV` only when not public prod; `/dev/seed` forbidden otherwise
- CORS enabled for hosted client → API
- Prototype: real `requestOtp` / `verifyOtp` / Bearer+deviceId / session restore
- Local dual-user seed only when hostname is localhost/`?devauth=1`

## Still required for GREEN

1. Public Nest API host with `SMS_PROVIDER=twilio` + Twilio secrets + `WINGMAN_PUBLIC_PROD=true` (or `NODE_ENV=production`)
2. Two physical phones completing the checklist above
3. S28 for durable OTP/sessions across API restart (kill/reopen of **API** is not fully covered by in-memory Maps)

## Env (field API)

```bash
NODE_ENV=production          # or WINGMAN_PUBLIC_PROD=true
AUTH_ALLOW_DEV=false         # ignored if public prod
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=…
TWILIO_AUTH_TOKEN=…
TWILIO_FROM_E164=…
AUTH_PEPPER=<strong secret>
AUTH_DEBUG_OTP=false         # never true on public field
```
