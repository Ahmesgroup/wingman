# Domain Test Matrix

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Covers every transition in `../architecture/STATE_MACHINES.md`: silent expiry emits no rejection; accept creates
Connection + two locks; one active signal per pair; one active connection per user; initiator≠recipient; window
math from absolute expiresAt; metConfirmed derivation; cooldown length by outcome; block-before-transition; rematch
from ExpiredConnection.
