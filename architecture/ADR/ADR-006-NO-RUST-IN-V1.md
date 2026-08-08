# ADR-006 — No Rust in V1
**Status:** Accepted
**Context:** Rust was proposed as "ideal" for proximity at day one.
**Decision:** Do proximity in the monolith with PostGIS / Redis GEO. Introduce a specialized (possibly Rust) geo
service only when metrics show a real bottleneck.
**Consequences:** One language/toolchain for V1; faster delivery; the real asset is the protocol, not the language.
