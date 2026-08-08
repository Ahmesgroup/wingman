# Idempotency

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

All state-changing endpoints accept `Idempotency-Key`. The server stores the key with the resulting state; a replay
returns the same result without side effects. Financial endpoints **require** a key (`Purchase.idempotencyKey`
unique; `PaymentTransaction.providerRef` unique) so double callbacks or double taps cannot double-charge or
double-grant entitlements.
