# Selfie & Liveness Security

**Status:** Decided (V4.1) · Related: `architecture/MEDIA_ARCHITECTURE.md`, `privacy/DATA_MINIMIZATION.md`

## Media handling

Opaque ids only in Redis; private EU bucket with SSE; short signed access scoped to recipient+session;
`Cache-Control: no-store, private`; no query strings in logs; event-driven deletion + lifecycle backstop +
orphan reconciliation + deletion metrics. See `architecture/MEDIA_ARCHITECTURE.md`. We never claim external
capture is impossible.

## Liveness must be defined precisely

The PRD conflates several ideas. For V1 we decide explicitly:

1. **Goal:** confirm a live human face is captured in real time (anti-replay), not full biometric identity match.
2. **Interaction selfie vs verification selfie:** the interaction selfie is *not* matched 1:1 against the
   verification selfie in V1; matching, if added, requires a DPIA and legal review.
3. **Biometric template:** none stored in V1.
4. **Provider:** on-device detection for V1; a specialized provider is an option gated by cost + privacy review.
5. **False negatives:** user can retry; repeated failures route to support, not a silent ban.
6. **Appeal:** documented path via support; decisions affecting accounts are auditable.

Because liveness may touch biometric data, this area is flagged for serious legal + technical analysis before
launch (see `privacy/DPIA_PREPARATION.md`).

## Threats addressed

Replay/deepfake (liveness + timestamp + real-time capture), leaked signed URL (short TTL + scope + no logging),
screenshotting (OS protections where available; honest limits), orphaned media (reconciliation job).
