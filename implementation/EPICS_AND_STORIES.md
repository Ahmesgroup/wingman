# Epics & Stories

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Epics: Foundation, Identity & Consent, Radar & Presence, Signal, Connection & Selfie, Mission & Cooldown, Safety &
Moderation, Monetization, Privacy Ops, Admin, (post-V1) Destiny. Each epic decomposes into stories with acceptance
criteria tied to invariants and the state machine. Example story — "One active connection per user": create
ActiveUserLock in the connection transaction; test concurrent accepts; assert the second fails.
