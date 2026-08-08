# Abuse Cases

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Concrete misuse to test against: mass-signal spam, targeting a specific person repeatedly, screenshotting selfies,
forwarding a signed URL, coordinating false reports to ban a rival, trying to pass a phone number/handle in Mission
Meet, opening two connections at once, reconnecting after a window to bypass expiry, replaying an old selfie, and
using Destiny to infer someone's routine. Each maps to a prevention in the threat model and a test in
`testing/SECURITY_TESTS.md`.
