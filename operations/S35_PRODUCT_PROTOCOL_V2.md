# S35 — Product Protocol V2 (controlled experiment)

**Status:** EXPERIMENT SPECIFICATION ONLY  
**Default:** `PRODUCT_PROTOCOL_V2_ENABLED=false`  
**Decision:** V2 is not Production-default and does not change the V1 domain engine.

## A. Baseline and observed friction

V1 is a separate-domain protocol: `RADAR → SIGNAL → initiator selfie → recipient selfie → initiator approval → MUTUAL → MISSION`. It protects against public browsing, explicit rejection, and uncontrolled chat. Its risks are not yet quantified by real-user evidence: the two-phone Evidence Pack is not started. Therefore alleged friction (extra conceptual steps, role language, and delayed selfie response) remains a hypothesis, not a reason to migrate state or schema.

## B. V2 proposition

The V2 *screen narrative* is:

`RADAR → SELFIE SIGNAL → SELFIE RESPONSE → MUTUAL → MISSION → OUTCOME → COOLDOWN`.

“Selfie Signal” is a user-facing label for sending interest and a private, opportunity-scoped selfie. “Selfie Response” is the recipient's private response. Expiration is silent. Media is private, opaque, recipient-authorized, and expires with the opportunity. Mission remains short, anti-contact, and intended to decide whether to say hello in real life.

## C. State analysis

V2 may map screens onto existing V1 states only:

| V2 screen | Existing authority |
|---|---|
| Radar | presence and candidate eligibility |
| Selfie Signal | Signal creation, then initiator selfie submission |
| Selfie Response | Signal open/accept, then recipient selfie submission |
| Mutual | existing approval and Connection state |
| Mission / Outcome / Cooldown | existing Connection transitions |

No V2 state machine, dual-write, or state migration is authorized. In particular, **Selfie is not Signal**: Signal is consent/interest; selfie media is a separate private artefact bound to a Connection.

## D. API analysis

The prototype must call the existing operations in order: create Signal; open/accept or resolve Signal; upload and submit selfie media; create/advance Connection; approve; Mission/outcome calls. It must not collapse endpoints, infer consent from a media upload, or add a public peer-simulation call. Existing server-side authorization, idempotency, expiry, and event semantics remain authoritative.

## E. Database and migration analysis

No schema migration is needed for the experiment. Existing Signal, Connection, private-media, identity, presence, and audit data retain their purposes and retention rules. Adding a `v2` field to Signal, storing media as Signal data, or backfilling V1 records is explicitly out of scope. Experiment assignment belongs in privacy-reviewed measurement metadata only if consent and the measurement plan permit it.

## F. Privacy and safety analysis

- Selfies remain camera-captured, opaque-id, private storage, authorized only to the paired recipient, and deleted on expiry.
- V2 must not reveal phone, exact location, public profile/photo, an explicit decline, or an expiry reason.
- Block/report must remain reachable; blocked people stay ineligible everywhere.
- Mission retains server-enforced anti-contact filtering and one active Connection per person.
- Any screenshot deterrence remains a UI limitation, never a claim that external capture is impossible.

## G. Flag, rollout, and rollback

`PRODUCT_PROTOCOL_V2_ENABLED` is the named server/configuration flag and its default is **false** in every environment. It permits an opt-in, allow-listed web experiment only after the current V1 Evidence Pack is GREEN. Flag-off renders and operates V1 unchanged. Disable the flag immediately for privacy/safety incident, contradictory state, unauthorized media access, or material error rate; no data migration is required for rollback.

## H. Exact screen and copy inventory

| Screen | Required copy / behavior |
|---|---|
| Radar | “From presence to hello.” Existing eligibility and anonymous dots only. |
| Selfie Signal | “Send a private selfie signal.” Explain silent expiry and recipient-only viewing. |
| Selfie Response | “Respond privately before this opportunity expires.” No decline control. |
| Mutual | “Mutual interest confirmed. Decide whether to say hello.” |
| Mission | “Decide where to meet.” Keep anti-contact rule and block/report access. |
| Outcome | Private per-user outcome; never disclose the other person's answer. |
| Cooldown | Existing invisibility and return-to-Radar rule; no gamified rematch prompt. |

## I. 2–5-person A/B plan

**Precondition:** V1 two-real-phone Evidence Pack GREEN without developer assistance. Recruit 2–5 consenting adults on real devices; do not record OTPs, tokens, phone numbers, selfies, or exact location. Randomize each completed opportunity to V1 wording/sequence or flagged V2 wording/sequence, balanced as practicable; never mix variants inside one Connection. Record device/browser, UTC timestamp, assigned variant, funnel completion, step duration, errors, block/report, and a short post-task comprehension response. This is a qualitative pilot, not a statistical proof.

## J. GO / NO-GO criteria

**GO to a larger controlled test only if:** every V2 participant completes a valid private-media and Mission flow; there is no domain/API divergence, privacy/safety incident, unauthorized media access, or developer intervention; V2 has no material increase in failed/expired flows against V1; and participants correctly explain that it is private, silent on non-response, and designed to say hello in real life.

**NO-GO / rollback if:** any safety or privacy breach, state contradiction, consent ambiguity, blocked-user leak, anti-contact regression, or developer-assisted completion occurs; V2 worsens completion materially in this small sample; or evidence is insufficient. NO-GO means retain V1 and document observations—never silently promote V2.

## K. Decision record and next action

S35 does not authorize a hard engine merge, database change, native implementation, or public rollout. It authorizes only this controlled specification. The next decisions are: (1) complete V1 Evidence Pack V1, then (2) run Igor's 2–5-person V2 A/B and document reproducible observations before proposing any ticket or code change.
