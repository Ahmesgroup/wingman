# Coding Standards

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

TypeScript strict, no unjustified `any`. Domain is pure and dependency-injected. Contracts via Zod in
`packages/contracts`. Errors use the catalog codes. Money in cents. Times as absolute `expiresAt`. No sensitive data
in logs. Small, well-named modules; transactions for multi-write invariants; Lua for pure-Redis atomicity.
