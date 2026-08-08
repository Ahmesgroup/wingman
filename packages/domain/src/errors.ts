export type DomainErrorCode =
  | "FORBIDDEN_TRANSITION"
  | "SIGNAL_SELF"
  | "SIGNAL_BLOCKED"
  | "SIGNAL_PAIR_ACTIVE"
  | "SIGNAL_QUOTA_EXCEEDED"
  | "SIGNAL_NOT_FOUND"
  | "SIGNAL_EXPIRED"
  | "SIGNAL_NOT_RECIPIENT"
  | "SIGNAL_NOT_SENDER"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_LOCKED"
  | "USER_LOCKED"
  | "BLOCKED_PAIR"
  | "IDEMPOTENCY_REPLAY"
  | "VALIDATION_REQUIRED"
  | "RATE_LIMITED"
  | "DESTINY_DISABLED"
  | "NOT_FOUND"
  | "CONFLICT";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}
