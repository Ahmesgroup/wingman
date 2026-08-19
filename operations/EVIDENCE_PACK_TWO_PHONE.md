# Two-phone Evidence Pack — Wingman protocol

**PRODUCT PROTOCOL READY remains NO.** This file is a source of truth with [`PROJECT_STATE.md`](./PROJECT_STATE.md)
and [`PROTOCOL_READINESS.md`](./PROTOCOL_READINESS.md).

```text
WINGMAN — PUBLIC PROTOCOL CERTIFICATION
S34 PUBLIC-PATH PREP
IMPLEMENTED : YES
DEPLOYED    : YES
COMMIT      : a3615bf  (S34; origin/master HEAD)
LIVE PROD   : a3615bf  (GitHub Production 2026-08-18T17:26:57Z;
                        Vercel Ready → wingman-prototype.vercel.app
                        and wingman-api-three.vercel.app)
INCLUDED ON LIVE TREE (ancestors, previously shipped — not later SHAs):
              f5292fa  S32 web background / fail-closed push
              f5822f9  S33 two-tap report/block
              e586dfc  S31 private selfie media
              c9421c6  S29 realtime Signal/Radar/chat
NO SHA AFTER a3615bf EXISTS ON origin/master (checked 2026-08-18).

PUBLIC URL ONLY     : READY
SERVER TICKET STATE : WIRED
SERVER COOLDOWN     : WIRED
HUMAN ANTI-CONTACT  : WIRED
OUTCOME UX           : WIRED

TWO-PHONE EVIDENCE PACK : NOT STARTED
PHONE A : PENDING
PHONE B : PENDING
END-TO-END PROTOCOL : PENDING
PRODUCT PROTOCOL READY : NO

NEXT GATE:
Twilio Fraud Guard 60410 may still pause SMS to +352 until Safe List or ~12h cooldown.
Do not disable Fraud Guard. Do not send more +352 OTP until that lifts.
Then: number → SMS → code → session → /me → Living Map → kill/reopen.
Then two real phones for this Evidence Pack.

Two real phones.
Public production URL only: https://wingman-prototype.vercel.app/
No x-user-id. No synthetic peers. No developer intervention.
No DB manipulation. No hidden test path (?api= ?qa=1 ?livingMap=1).

Required proof:
OTP → Profile → Radar → Signal → Selfie A → Selfie B → Mutual
→ Mission → Realtime chat → Outcome → Cooldown → Radar

PASS = complete protocol works beginning to end on BOTH phones
       using only the public product.
FAIL = record exact boundary: device, browser, step, expected, observed, timestamp.
Then fix ONLY the proven boundary and replay the same matrix from the start.

NO NEW PRODUCT FEATURE UNTIL FIRST TWO-PHONE VERDICT.
```

Use only the public product: **https://wingman-prototype.vercel.app/**  
Do not use a local build, a test link, browser developer tools, a query-string option (`?api=`, `?qa=1`,
`?livingMap=1`), an API address, or a developer login. Never record OTP codes, tokens, full phone numbers, exact
locations, or selfies.

## Three checks per step (mandatory)

A-only screen success is **not** PASS. Every required step must be marked on **all three**:

| Check | Meaning (observable on the public product — no DevTools, no DB) |
|-------|------------------------------------------------------------------|
| **UI** | This phone shows the expected screen, copy, and controls. |
| **Server** | The step is server-owned: it survives reopen where required; remaining time does not reset to a local fake; a blocked action stays blocked. |
| **Peer** | The other phone shows the matching protocol state **without refresh**. |

Verdict for a step = PASS only if UI **and** Server **and** Peer are PASS on the same attempt.

## Before starting

1. Recruit two people, **Phone A** and **Phone B**. Each needs their own phone number and phone.
2. Put both in the same safe public place, roughly 10–50 metres apart. Turn on mobile data/Wi-Fi. When the browser asks
   for location, **allow approximate location**. Keep the page **in the foreground** unless an appendix row says to
   close it (Radar presence uses a foreground heartbeat; it lasts about two minutes without one).
3. Record device model, OS, and browser/PWA for each phone. Bottom tabs are **Radar**, **Discover**, **Pulse**, and
   **Me**. Incoming hello is an inbox on Radar — not a fifth tab.
4. Agree on neutral test profile names (for example, “A” and “B”). Do not enter contact details, real addresses, or
   sensitive information in profile or chat.
5. One observer records short, factual observations. A failure is a result, not a reason to retry with developer help.
6. Fill **Devices**, **UTC timestamp** (ISO-8601), **Observed**, and the three checks on every attempted step. Blank is
   not PASS.

## Exact human steps

### Phone A

1. Open **https://wingman-prototype.vercel.app/** with no query string.
2. Complete splash/onboarding. Enter **A’s own number**. Complete the SMS OTP. Reach profile.
3. Save a minimal profile. Confirm A is still A after a full close and reopen of the public URL.
4. Accept consent. Go to **Radar**. Allow **approximate location**. Tap **Go active** while B is still inactive. Confirm
   empty-state / **0 nearby**.
5. After B is active, wait up to one minute **without refreshing**. Confirm **1 nearby** (only B).
6. Send one Signal to B. Stay on the page.
7. When prompted, take a **new camera selfie** and send it. Confirm B can view it only in this connection.
8. View B’s selfie only through this connection. Perform the displayed **mutual** approval.
9. Enter **Mission**. Confirm ticket remaining (if shown) is counting from the product, not a reset local timer.
10. In chat, send `At the agreed spot`. Confirm B’s reply appears live. Do not send contact details.
11. Record **only A’s** outcome (**Yes, we met** / **Not this time**). Wait if B has not answered — do not see B’s choice.
12. After both have answered, wait the displayed **cooldown**, then return to **Radar**. Confirm the old connection is
    gone and Radar is usable again.

### Phone B

1. Open **https://wingman-prototype.vercel.app/** with no query string (own phone, own number).
2. Complete splash/onboarding. Enter **B’s own number**. Complete the SMS OTP. Reach profile. B must not be signed in as A.
3. Save a minimal profile. Confirm B is still B after a full close and reopen of the public URL.
4. Accept consent. Stay **off** Radar (do not tap **Go active**) until A has recorded 0 nearby.
5. Tap **Go active** at the agreed nearby place. Allow **approximate location**. Wait up to one minute **without
   refreshing**. Confirm **1 nearby** (only A).
6. Receive A’s Signal **without refreshing**. Open it and accept.
7. View A’s selfie only through this connection. Take a **new camera selfie** and send it.
8. Follow mutual approval. Enter **Mission** without refreshing.
9. In chat, receive A’s message live. Reply `On my way`. Confirm it appears on A without refresh.
10. Record **only B’s** outcome. After A has answered, B still must not see A’s choice until B has answered (and must
    not choose for A).
11. After both have answered, wait the displayed **cooldown**, then return to **Radar**. Confirm the old connection is
    gone and Radar is usable again.

## Required 12-step run sheet

Replay **from step 1** after any FAIL. Do not patch forward.

| # | Step | A does | B does | UI expected | Server expected | Peer expected | Devices / OS / browser | UTC | Observed | UI | Server | Peer | Verdict |
|---|------|--------|--------|-------------|-----------------|---------------|------------------------|-----|----------|----|--------|------|---------|
| 1 | OTP | Own number + SMS sign-in | Own number + SMS sign-in | Each reaches profile | Real SMS path; no `x-user-id` | B is not signed in as A | | | | | | | |
| 2 | Profile | Save minimal profile; close app; reopen public URL | Same | Profile still present | Identity/profile durable after reopen | Each still has their own profile | | | | | | | |
| 3 | Radar | Allow location; **Go active** first; then wait for B | Stay inactive until A has 0 nearby, then **Go active** | A alone = 0 nearby; then each sees 1 nearby | Presence from live geo/heartbeat, not invented people | Each sees only the other without refresh | | | | | | | |
| 4 | Signal | Send one Signal to B | Do not refresh | A sees sent; B can open incoming | Signal is the real inbox, not a local fake | B receives promptly without refresh | | | | | | | |
| 5 | Selfie A | New camera selfie, send | View only in this connection | Camera flow works on A | Private media; not a public file URL | B can view it only here | | | | | | | |
| 6 | Selfie B | View only in this connection | New camera selfie, send | Camera flow works on B | Private media; not a public file URL | A can view it only here | | | | | | | |
| 7 | Mutual | Displayed approval action | Follow the same connection | Both see Mission as next | Connection advanced on the server | Both reach Mission without refresh | | | | | | | |
| 8 | Mission | Open Mission Meet | Open Mission Meet | Same mission screen | Ticket remaining is server remaining (no local reset to 2:00:00) | Both are in the same mission | | | | | | | |
| 9 | Realtime chat | Send `At the agreed spot` | Reply `On my way` | Both messages visible | Chat starts empty (no demo line); contact details blocked with human copy if tried | Each message appears live on the other phone | | | | | | | |
| 10 | Outcome | Own outcome only | Own outcome only | Waiting copy if the other has not answered | Cannot choose for the other; cooldown does not start until both answered | Other phone does not show this person’s choice | | | | | | | |
| 11 | Cooldown | Wait displayed remaining | Wait displayed remaining | Cooldown UI with remaining time | Remaining from server; connection not shown as live | Both are in cooldown | | | | | | | |
| 12 | Radar | Return to Radar after cooldown | Return to Radar after cooldown | Radar usable again | Previous connection gone | Both can use Radar again (no stuck ticket) | | | | | | | |

## Decision rule

- Mark a step **PASS** only when UI + Server + Peer all happened without developer assistance.
- Mark **FAIL** when any of the three checks fail, the result was unclear, or help was required. Record:
  **device, browser, step, expected, observed, timestamp**.
- Leave a step blank only if it was not attempted. Blank is not PASS.
- After FAIL: fix **only** that proven boundary, then replay this **same 12-step matrix from the start**.
- A screenshot may be attached only when it contains no OTP, token, phone number, selfie, exact location, or private chat.
- Do not create a new ticket from a hypothesis. First preserve the reproducible observation above.

## Current status

All 12 required steps are **NOT STARTED** as of 2026-08-18. Automated checks establish wiring only; they do not fill a
PASS row and do not change the readiness verdict.

**Blocked:** this pack cannot be executed without two real phones and two real numbers. Do not mark GREEN from a
test harness, a browser desktop walk, or production `/internal/ready`.

**FINAL VERDICT = NO** until every required row is PASS on both phones.

## Appendix — optional extra rows (not the gate)

Useful if the 12-step run already passed, or if a specific risk appears during the run. Skip freely. A FAIL here does
not rewrite the 12-step matrix, but it can still be a reproducible boundary.

| # | What A and B do | Expected | Devices | UTC | Observed | PASS / FAIL |
|---|-----------------|----------|---------|-----|----------|-------------|
| A1 | Location deny: A refuses location, then taps **Go active**. | **Go active** stays off / A stays invisible; **0 nearby**. Fail closed — not a Radar defect. | | | | |
| A2 | After both are nearby, B taps **Go invisible**. A does not refresh. | A returns to empty-state / **0 nearby**. | | | | |
| A3 | B **Go active** again. Wait up to one minute without refresh. | Each sees only the other again (1 nearby). | | | | |
| A4 | During Mission, B fully closes the browser/PWA, reopens the public URL, returns to the connection. | B returns; chat history still there; ticket remaining comes back from the server (not a reset local timer). | | | | |
| A5 | After cooldown, new Signal → Selfie → Mutual → Mission. In Mission, A taps **Report & block**, chooses one category, returns to Radar. B stays on the page. | A sees blocked confirmation. B is **not** notified. After both are active on Radar, A no longer sees B. | | | | |
| A6 | Optional third consenting adult tries to open A↔B selfie or chat. Skip if no third person. | Third person is denied; no private media or chat leaks. | | | | |

## S35 V2 A/B observations — separate and not readiness evidence

S35 remains false by default and cannot replace this V3.1 Evidence Pack. Run it only after every required 12-step row
passes with two real people. Never record identity, OTP, token, selfie, or exact location data.

| Participant pseudonym | Device/browser | UTC timestamp | Variant (V1/V2) | Expected | Observed | Completion / safety notes | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| | | | | Private, silent, anti-contact flow understood; no developer assistance | NOT RUN | | |
