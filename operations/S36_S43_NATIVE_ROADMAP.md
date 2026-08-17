# S36–S43 — Native roadmap (deferred)

**Status:** DOCUMENTATION ONLY — no `apps/mobile` Expo project this sprint.  
**Hard entry gate:** current web V1 Evidence Pack is GREEN with two real users completing the protocol without developer assistance.

Native is a client of `packages/contracts` and the server-authoritative state machines. It must not duplicate domain transitions, timers, eligibility, authorization, or safety policy.

| Sprint | Scope | Exit evidence |
|---|---|---|
| S36 Foundation | Expo/RN decision record, TypeScript workspace integration, design-token access, secure-storage and observability plan | Architecture review confirms no client-side domain engine. |
| S37 Contracts and API client | Generated/typed consumer of `packages/contracts`, REST idempotency, WebSocket reconnect/reconciliation from `state` + `expiresAt` | Contract compatibility tests against the existing API. |
| S38 Auth and profile | OTP session lifecycle in secure storage, logout, profile/consent reopen and error recovery | Real-device sign-in/profile persistence proof. |
| S39 Radar and location | Permission UX, coarse location, active/invisible lifecycle, candidate rendering without precise coordinates | Two-device Radar proof; alone remains zero and no ghost candidates. |
| S40 Camera and private media | Camera-only capture, permission failure, authenticated private upload/view, expiry and deletion UX | Recipient-only media and expiry proof on iOS and Android. |
| S41 Realtime and Mission | Signal/Connection event reconciliation, Mission chat, anti-contact behavior, background/foreground reconnect | Two-device Mission proof without contradictory state. |
| S42 Safety, outcome, offline | Block/report, outcome/cooldown, offline/reconnect, accessibility, telemetry redaction, kill switch | Safety and offline matrix passes on real devices. |
| S43 TestFlight certification | Signed builds, privacy declarations, test cohort, Evidence Pack replication, release/no-go review | TestFlight evidence supports GO / FIX LIST / NO-GO. |

## Constraints

- `PRODUCT_PROTOCOL_V2_ENABLED=false` remains default; native must not make V2 the production path.
- S35 can be evaluated as a separately flagged web experiment only after V1 proof; it is not a native prerequisite to build V1.
- No synthetic peer, `x-user-id`, seeded production identity, public demo path, Destiny public rollout, or payment enablement.
- A successful build, CI run, or TestFlight upload is not Evidence Pack completion.
