# Camera & Selfie Flow

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Real-time capture only (gallery import disabled). On-device liveness before send; timestamp overlaid and recorded.
Upload via presigned PUT to private storage; the app never holds a public URL. Viewing a peer selfie uses a
short-lived authorized fetch; the app applies available OS anti-capture protections and never claims full prevention.
