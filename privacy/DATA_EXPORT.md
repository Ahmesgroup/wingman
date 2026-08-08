# Data Export

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Users can export their personal data as JSON: profile, interests/languages, consent history, entitlements/purchases
(non-sensitive fields), and minimal protocol metadata. Exports never include others' selfies, chat content, precise
location, or another user's private outcome. Delivered via a `PrivacyRequest` artifact with a short-lived link.
