# Redis Architecture

**Status:** Decided (V4.1) · Related: `REALTIME_ARCHITECTURE.md`, `STATE_MACHINES.md`, DECISION_LOG D-012/D-013

Redis holds only **ephemeral** state. It is never described as guaranteeing that data cannot reach disk (D-013);
instead we specify an operational policy for sensitive namespaces.

## Key catalogue

| Key | Type | TTL | Owner | Created by | Deleted by | Notes |
|---|---|---|---|---|---|---|
| `radar:{region}` | GEO (ZSET) | none (members reaped) | Radar | heartbeat | reaper worker | one regional set in V1 |
| `radar:heartbeat:{region}` | ZSET (score=ts) | none | Radar | heartbeat | reaper worker | drives staleness |
| `presence:{userId}` | string | 120s | Radar | heartbeat | expiry | Active/Invisible/Mission/Cooldown |
| `active-user-lock:{userId}` | string | connection window | Connection | lock acquire | terminal state | mirror of DB lock for fast checks |
| `signal:{signalId}` | hash | 600s | Signals | createSignal | accept/expire | timer + status |
| `selfie-session:{connectionId}` | hash | 300s | Connection | accept | expiry/validate | opaque media ids only |
| `mission-chat:{missionId}` | stream | ≤1500s | Missions | mission open | close/expiry | messages; no payload in logs |
| `cooldown:{userId}` | string | 900–1800s | Missions | outcome | expiry | length from outcome |
| `rate-limit:{userId}:{action}` | string/counter | window | Edge/API | first hit | expiry | anti-spam |
| `destiny:copresence:{pairKey}` | hash | 48h sliding | Destiny | co-presence | purge | coarse count only |

Each key documents: type, structure, TTL, logical owner, creation/deletion events, crash behavior, reconciliation,
cleanup, persistence risk.

## Radar reaping (cell-aware)

`GEOADD` members cannot carry an independent per-member TTL. We keep a twin heartbeat ZSET and reap:

```
EXPIRED = ZRANGEBYSCORE radar:heartbeat:{region} -inf (now-120s)
if EXPIRED: ZREM radar:{region} EXPIRED ; ZREM radar:heartbeat:{region} EXPIRED
```

If a single region grows enough to need cells, we switch to `radar:{region}:{cell}` +
`heartbeat:{region}:{cell}` + a `user-cell:{region}:{userId}` reverse index so a move removes the user from the old
cell and expiry targets the correct cell (D-012). We do not re-introduce premature sharding.

## Selfie sessions

Stores only `{ initiatorMediaId, recipientMediaId, capturedAt, state, expiresAt }` — never a public URL (D-014).
On expiry/validation the key is deleted and a media-purge event is emitted.

## Mission chat

A Redis Stream with TTL ≤ 25 min. The anti-contact filter runs before append. On clean close or expiry the key is
deleted and nothing is written to Postgres. On report, the domain seals the strictly necessary items into encrypted
evidence (D-016) before deletion.

## Server-authoritative timers

Every timed key stores an absolute `expiresAt`. The client renders `expiresAt − serverTime`. Offline never pauses.
On reconnect, if `now > expiresAt` the expiry transition is consumed immediately.

## Persistence & residency policy (sensitive namespaces)

- AOF disabled; no application RDB snapshots for sensitive namespaces.
- No automatic backups of sensitive namespaces.
- EU residency; encryption in transit; encryption at rest if the provider persists regardless.
- No sensitive payloads in logs or telemetry.
- Distinct keys per environment and region; no cross-region replication of sensitive data.
- Verify with the provider that persistence can actually be disabled and backups suppressed.
