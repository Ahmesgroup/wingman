# Notification Architecture

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

A workers-driven push pipeline keyed on device tokens (consented). Templates carry no identity, photo, or precise
location. Delivery is idempotent; a `PushNotificationLog` (post-V1 optional) records sends without sensitive payloads.
Notification consent is a distinct purpose in the consent model.
