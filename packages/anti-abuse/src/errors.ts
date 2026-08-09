export type AntiAbuseErrorCode =
  | "ABUSE_COOLDOWN"
  | "ABUSE_SLOW_DOWN"
  | "ABUSE_CHALLENGE"
  | "ABUSE_TEMP_RESTRICT"
  | "ABUSE_REVIEW";

export class AntiAbuseError extends Error {
  readonly code: AntiAbuseErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AntiAbuseErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AntiAbuseError";
    this.code = code;
    this.details = details;
  }
}

export function httpStatusForAbuse(code: AntiAbuseErrorCode): number {
  switch (code) {
    case "ABUSE_SLOW_DOWN":
    case "ABUSE_COOLDOWN":
    case "ABUSE_TEMP_RESTRICT":
      return 429;
    case "ABUSE_CHALLENGE":
      return 403;
    default:
      return 429;
  }
}
