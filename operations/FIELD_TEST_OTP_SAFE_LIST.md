# Field-test OTP — Twilio Verify Safe List (Fraud Guard 60410)

**Status:** Ops runbook only · **PRODUCT PROTOCOL READY: NO**  
**Does not change** Wingman OTP code or env.  
**Does not certify** S27B. SMS proof still requires the public-site Evidence Pack in [`S27_IDENTITY_OTP.md`](./S27_IDENTITY_OTP.md).

**Sources (Twilio docs, last modified March 2026):** [Verify Fraud Guard](https://www.twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard) · [Error 60410](https://www.twilio.com/docs/api/errors/60410) · [Viewing Verify logs](https://www.twilio.com/docs/verify/viewing-logs-with-twilio-console) · [Verify Safe List API](https://www.twilio.com/docs/verify/api/safe-list) · [Verify Geo Permissions](https://www.twilio.com/docs/verify/preventing-toll-fraud/verify-geo-permissions)

Phone numbers in this file are placeholders only: **`+352XXXXXXXX`**. Never paste a real tester number into git.

---

## What 60410 means

**60410 = Verification delivery attempt blocked** by **Verify Fraud Guard**.

Twilio has placed a **temporary ~12 hour SMS block on the destination prefix** (here, Luxembourg **`+352`**) after it flagged suspected SMS pumping / unusual destination traffic. The prefix block lifts after that window if no further fraud is detected. If fraud is seen again, another 12-hour prefix block can start.

This is **not** a Wingman OTP-engine bug. The Verify Service (`VA…`) received the start request; **delivery was blocked before SMS**.

---

## Policy (do not violate)

| Do | Do not |
|----|--------|
| Safe-list **only** authorized field-test handsets, one E.164 at a time | Disable **Fraud Guard** on the Wingman Verify Service |
| Keep Geo Permissions on **Monitor … for blocking fraud** (or existing tight settings) for countries you actually send to | Open Geo Permissions to **Allow all traffic** globally |
| Confirm you are on **Verify** Service **`VA…`** | Edit **Conversations** Services (**`IS…`**) — those are not OTP |
| Prefer **Safe List** for known testers | Turn Fraud Guard off “just for the field test” |

Twilio documents turning Fraud Guard off as a last-resort false-positive option. **Wingman ops: never do that.** Use Safe List instead.

---

## Wait vs Safe List

| Option | Effect | When to use |
|--------|--------|-------------|
| **Wait ~12 hours** | Prefix `+352` (or whatever 60410 blocked) can send again for **everyone** on that prefix, until the next fraud signal | No testers need SMS **now**; you accept the cooldown |
| **Safe List (this runbook)** | **That exact E.164** is never blocked by Fraud Guard or Geo Permissions. Prefix block **stays** for other `+352` numbers | Authorized field testers must receive OTP **before** cooldown ends, or must not be blocked again |

Safe List does **not** disable Fraud Guard. It exempts listed numbers only.

---

## 1. Open the right product (Verify `VA…`, not Conversations `IS…`)

1. Sign in at [Twilio Console](https://console.twilio.com/).
2. Confirm you are in the **same account** that owns `TWILIO_VERIFY_SERVICE_SID` on `wingman-api` Production (do not paste the SID into tickets or git).
3. Left nav: **Develop** → **Verify** → **Services**  
   Direct: [Verify Services](https://console.twilio.com/us1/develop/verify/services)
4. Click the **Wingman** (or production OTP) service.
5. On the service header, confirm SID starts with **`VA`**.
6. If the SID starts with **`IS`**, you are on **Conversations** — go back. Conversations Safe List / messaging is **not** Verify OTP.

**Confirm Fraud Guard stays on (do not change it):**

7. Service → **Service settings** → **SMS** tab.
8. **Enable Fraud Guard** = **on**. Leave **Protection Level** as-is (typically **Standard**).
9. Do **not** save a change that turns Fraud Guard off.

**Geo (do not open globally):**

10. Left nav: **Develop** → **Verify** → **Settings** → **Geo permissions**  
    Direct: [Geo permissions](https://console.twilio.com/us1/develop/verify/settings/geopermissions)
11. For Luxembourg / countries you actually test: keep **Monitor all traffic for blocking fraud** (SMS), **not** **Allow all traffic** for the whole world.
12. Do **not** batch-set all continents to Allow.

---

## 2. Safe List — Console (preferred): Unblock on Blocked Verifications

Twilio Console has **no separate “add number” form on the Verify Service page**. Documented Console path: **Unblock** on a blocked verification, which **adds that E.164 to the Safe List**.

1. Left nav: **Monitor** → **Logs** → **Verify**  
   Direct: [Verify logs — Verifications](https://console.twilio.com/us1/monitor/logs/verify-logs)
2. Open the **Blocked Verifications** tab  
   Direct: [Blocked Verifications](https://console.twilio.com/us1/monitor/logs/verify-fraud-logs)
3. Filter:
   - **Service ID** = the Wingman **`VA…`** service (not Conversations)
   - **Country** / prefix search: `+352` or the blocked prefix
   - Date range covering the failed Send code
4. Open a row whose **To** number is an **authorized field tester** only (`+352XXXXXXXX` in notes — match the real handset in Console, never commit it).
5. On the log row / details, click **Unblock**.
6. Confirm: Twilio adds that number to the **Safe List** so Fraud Guard / Geo will not block it again.
7. Repeat **only** for other authorized testers. Do **not** Unblock unknown or bulk `+352` traffic.

If the tester never appears on Blocked Verifications (block happened only as Monitor **Error 60410**, or you need to allowlist **before** the next send), use §3.

---

## 3. Safe List — add E.164 when Console has no Unblock row

Account-level Verify Safe List (Pilot; SMS). Numbers stay until explicitly removed. Duplicate add returns **60411**.

Use **one authorized number** in E.164, e.g. `+352XXXXXXXX`. Run this **on an ops machine**, not in the repo. Do not log the number.

```bash
curl -X POST "https://verify.twilio.com/v2/SafeList/Numbers" \
  --data-urlencode "PhoneNumber=+352XXXXXXXX" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

Check:

```bash
curl -X GET "https://verify.twilio.com/v2/SafeList/Numbers/%2B352XXXXXXXX" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

HTTP **200** = listed. HTTP **404** = not listed.

(Global Safe List `POST https://accounts.twilio.com/v1/SafeList/Numbers` is the GA sibling; Console Unblock also feeds that list. Prefer the Verify Safe List call above for OTP.)

---

## 4. Human UI check (after cooldown **or** Safe List)

Use **only** the public product URL. No Nest URL, no `?api=`, no `?qa=1`.

1. Open https://wingman-prototype.vercel.app/
2. Enter authorized tester number **`+352XXXXXXXX`** (real digits on the phone, not in this file).
3. **Send code** → SMS must arrive on the handset (Twilio Verify, not coordinator/field-test copy).
4. Enter the SMS code → session.
5. Confirm **`/me`** (profile / “you”) loads for that session.
6. Open **Living Map** and confirm it walks with the logged-in session (no re-login).
7. **Kill the browser / PWA** (force-close), reopen the same public URL → still the same user, no OTP.

If SMS still fails: in Console, **Monitor** → **Logs** → **Errors** / Verify **Blocked Verifications** — if **60410** remains on a **non**-safe-listed number, wait for prefix cooldown or confirm the E.164 is actually on the Safe List (§3 GET). If Fraud Guard was turned off, **turn it back on** and use Safe List only.

**PRODUCT PROTOCOL READY stays NO** until the S27B Evidence Pack in [`S27_IDENTITY_OTP.md`](./S27_IDENTITY_OTP.md) is complete. This runbook only unblocks delivery for listed testers.
