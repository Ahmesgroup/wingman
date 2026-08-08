# Deployment

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Single EU region. Containerized API + workers; managed PostgreSQL (EU primary) and Redis (EU, sensitive namespaces
without persistence). Blue/green or rolling deploys; migrations gated in CI. Object storage is a private EU bucket
with SSE and lifecycle rules.
