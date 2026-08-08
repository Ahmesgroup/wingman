# Destiny Connection — Privacy Assessment

**Status:** Provisional (likely post-V1) · Related: `DPIA_PREPARATION.md`, DECISION_LOG D-020

Destiny is the highest-risk feature: repeated proximity, habit inference, possible inference of home/work,
stalking risk, re-identification, exposure of implicit social ties. Even without showing the location to the other
user, the system processes it.

## Decisions

- **Off by default**, separate explicit opt-in, immediate pause.
- **No persistent trajectories**; raw proximity events are aggregated then discarded.
- **Coarse spatial aggregation with pseudonymized co-presence counting** — *not* called "k-anonymity", because the
  pair identity is retained to make the introduction.
- Require: sufficiently populated context, coarse time window, minimum simultaneous presence, multiple occurrences
  on different days, short TTL on the candidate, active Destiny consent on both sides, blocks/restrictions evaluated
  before counting and before prompting.
- **Allow-list of contexts** (festivals, malls, campuses, partner events, dense public leisure areas) rather than an
  impossible exhaustive exclusion list of sensitive places.
- No prompt near a presumed home; sensitive locations excluded.
- **DPIA + abuse/stalking review + legal validation before launch.**

A ~1 km cell is simultaneously too coarse to prove two people actually crossed and precise enough to infer
frequented areas; the rule set above compensates, and the feature ships only after the DPIA.
