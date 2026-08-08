# DPIA Preparation

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

A Data Protection Impact Assessment is required before launching features that process location and, especially,
Destiny Connection and any liveness/biometric processing. The DPIA covers necessity/proportionality, risks (stalking,
re-identification, inference of sensitive locations), mitigations (coarse aggregation, allow-lists, short TTL,
off-by-default, blocks-before-count), and residual risk. Destiny does not launch without it.
