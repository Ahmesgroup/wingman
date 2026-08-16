import { AuthError } from "./auth-service.js";

/** S27A — controlled field-test auth (no Twilio). Never enable with AUTH_ALLOW_DEV. */
export function isFieldTestAuthMode(): boolean {
  return process.env.AUTH_FIELD_TEST_MODE === "true";
}

export function getFieldTestOtpCode(): string {
  const code = (process.env.FIELD_TEST_OTP_CODE ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new AuthError(
      "OTP_INVALID",
      "FIELD_TEST_OTP_CODE must be a 6-digit code when AUTH_FIELD_TEST_MODE=true",
    );
  }
  return code;
}

export function normalizePhoneE164(phone: string): string {
  const s = String(phone || "").trim().replace(/[\s()-]/g, "");
  if (!s) return "";
  return s.startsWith("+") ? s : `+${s}`;
}

/** E.164: + then country code (non-zero) and subscriber digits, 8–15 digits total after +. */
export function assertValidPhoneE164(phone: string): string {
  const normalized = normalizePhoneE164(phone);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new AuthError("PHONE_INVALID", "Phone must be a valid E.164 number");
  }
  return normalized;
}

export function parseFieldTestAllowlist(): string[] {
  return (process.env.FIELD_TEST_PHONE_ALLOWLIST ?? "")
    .split(",")
    .map((p) => normalizePhoneE164(p))
    .filter(Boolean);
}

export function assertFieldTestPhoneAllowed(phoneE164: string): void {
  const phone = normalizePhoneE164(phoneE164);
  const list = parseFieldTestAllowlist();
  if (list.length === 0) {
    throw new AuthError(
      "PHONE_NOT_ALLOWED",
      "FIELD_TEST_PHONE_ALLOWLIST is empty — field-test auth refuses all phones",
    );
  }
  if (!list.includes(phone)) {
    throw new AuthError("PHONE_NOT_ALLOWED", "Phone number is not on the field-test allow-list");
  }
}
