# Location Privacy

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Precise location is never transmitted to other users or stored persistently. The Radar uses an approximate adaptive
radius; the UI shows qualitative distance ("very close", "nearby"), never exact meters or a precise point. Coarse
location processing (Radar, Destiny) is minimized and consented per purpose. Destiny adds allow-listed contexts and
sensitive-area exclusions (see `privacy/DESTINY_PRIVACY_ASSESSMENT.md`).
