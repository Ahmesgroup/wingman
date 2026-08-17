# Two-phone Evidence Pack — Wingman protocol

**PRODUCT PROTOCOL READY remains NO.** V3.1 is the owner-locked authority. It can become GREEN only when every row
below is PASS, recorded by two real people without developer assistance.

Use only the public product: **https://wingman-prototype.vercel.app/**  
Do not use a local build, a test link, browser developer tools, a query-string option, an API address, or a developer
login. Never record OTP codes, tokens, full phone numbers, exact locations, or selfies.

## Before starting

1. Recruit two people, called **A** and **B** below. Each needs their own phone number and phone. Use different browsers
   or PWA installs only if each person is still using their own phone.
2. Put both people in the same safe public place, roughly 10–50 metres apart. Turn on mobile data/Wi-Fi and location
   permission for the site. Keep the page open for the entire run unless a row says to close it.
3. Each person opens the public URL above, then records their device model, OS, and browser/PWA in the table.
4. Agree on neutral test profile names (for example, “A” and “B”). Do not enter contact details, real addresses, or
   sensitive information in profile or chat.
5. One observer records short, factual observations. A failure is a result, not a reason to retry with developer help.

## Run sheet

| # | What A and B do on the public site | Expected result | Device / OS / browser or PWA | UTC timestamp | Short observed fact | PASS / FAIL |
|---|---|---|---|---|---|---|
| 1 | A enters their own number, receives the SMS, and completes sign-in. | A reaches the profile screen without help. | | | | |
| 2 | B repeats step 1 with their own number. | B reaches the profile screen; B is not signed in as A. | | | | |
| 3 | A completes and saves a minimal profile, closes the browser/PWA completely, then opens the public URL again. | A is still signed in and the saved profile is still present. | | | | |
| 4 | B repeats step 3. | B is still signed in and the saved profile is still present. | | | | |
| 5 | Each accepts the displayed consent and continues to Radar. With the keyboard open on any form, use the visible next/save control. | The control is visible and works; neither person is blocked by the keyboard. | | | | |
| 6 | Keep B out of Radar. A enters Radar and waits up to one minute. | A sees the empty-state wording and **0 nearby people**; no invented person appears. | | | | |
| 7 | B enters Radar at the agreed nearby location. A and B each wait up to one minute without refreshing. | Each sees only the other eligible participant; no extra or stale person appears. | | | | |
| 8 | A sends one Signal to B. B does not refresh or reopen the page. | B receives the Signal promptly and can open it. | | | | |
| 9 | B accepts the Signal and both follow the Selfie prompt. | Both people are in the same private connection and see the correct next step. | | | | |
| 10 | A takes and sends a new camera selfie. B tries to view it only through the connection. | The camera flow works; B can view it only in this connection. | | | | |
| 11 | B takes and sends a new camera selfie. A tries to view it only through the connection. | Same result for B’s selfie. | | | | |
| 12 | A performs the displayed mutual-approval action. Neither person refreshes. | Both advance to the Mission step promptly. | | | | |
| 13 | In Mission Meet chat, A sends “At the agreed spot”; B replies “On my way.” Do not send contact details. | Both messages appear live on the other phone. A contact-detail attempt is safely blocked or filtered. | | | | |
| 14 | While still in Mission, B fully closes the browser/PWA, reopens the public URL, and returns to the connection. | B can return and sees the existing chat history. | | | | |
| 15 | Follow Mission through its visible finish/outcome screens. Each person records only their own outcome. | Both can record an outcome; neither can choose for the other. | | | | |
| 16 | Wait for the displayed cooldown to end, then return to Radar. | The connection is not shown during cooldown; Radar can be used again afterwards. | | | | |

## Decision rule

- Mark a row **PASS** only when its expected result happened without developer assistance.
- Mark **FAIL** when the expected result did not happen, was unclear, or required help. Include the observable symptom
  (for example: “B did not receive Signal after 60 seconds; page stayed open”).
- Leave a row blank only if it was not attempted. Blank is not PASS.
- A screenshot may be attached only when it contains no OTP, token, phone number, selfie, exact location, or private chat.
- Do not create a new ticket from a hypothesis. First preserve the reproducible observation above; then decide whether a
  ticket is necessary.

## Current status

All V3.1 rows are **NOT STARTED** as of 2026-08-17. Automated checks establish wiring only; they do not fill a PASS
row and do not change the readiness verdict. Real SMS sign-in and two-human observations are still required.

## S35 V2 A/B observations — separate and not readiness evidence

S35 remains false by default and cannot replace this V3.1 Evidence Pack. Run it only after every V3.1 row passes with
two real people. Never record identity, OTP, token, selfie, or exact location data.

| Participant pseudonym | Device/browser | UTC timestamp | Variant (V1/V2) | Expected | Observed | Completion / safety notes | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| | | | | Private, silent, anti-contact flow understood; no developer assistance | NOT RUN | | |
