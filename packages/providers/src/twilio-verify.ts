import { AuthError } from "@wingman/auth";

export interface OtpVerificationProvider {
  readonly name: string;
  /** Start SMS verification for an E.164 phone. Never logs OTP or raw phone. */
  start(phoneE164: string): Promise<{ providerSid: string }>;
  /** Check submitted OTP. Resolves only when approved; otherwise throws AuthError. */
  check(phoneE164: string, code: string): Promise<void>;
}

export type TwilioVerifyConfig = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
  apiBase?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function logVerify(event: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      service: "twilio-verify",
      to: "[redacted]",
      ...event,
      // never echo OTP / phone / credentials
      code: undefined,
      phone: undefined,
      To: undefined,
      AuthToken: undefined,
    }),
  );
}

type TwilioErrorBody = {
  code?: number;
  message?: string;
  status?: string;
  sid?: string;
};

/**
 * Twilio Verify (SMS channel) — OTP generation & delivery owned by Twilio.
 * HTTP only; no Twilio SDK. Credentials never appear in responses or logs.
 */
export class TwilioVerifyProvider implements OtpVerificationProvider {
  readonly name = "twilio_verify";

  constructor(private readonly cfg: TwilioVerifyConfig) {}

  async start(phoneE164: string): Promise<{ providerSid: string }> {
    const json = await this.post("Verifications", {
      To: phoneE164,
      Channel: "sms",
    });
    const providerSid = json.sid ?? `verify_${Date.now()}`;
    logVerify({ msg: "verify.started", provider: this.name, providerSid, status: json.status });
    return { providerSid };
  }

  async check(phoneE164: string, code: string): Promise<void> {
    const json = await this.post("VerificationCheck", {
      To: phoneE164,
      Code: code,
    });
    if (json.status === "approved") {
      logVerify({ msg: "verify.approved", provider: this.name, providerSid: json.sid });
      return;
    }
    if (json.status === "canceled") {
      throw new AuthError("OTP_EXPIRED", "OTP expired");
    }
    throw new AuthError("OTP_INVALID", "Invalid OTP code");
  }

  private async post(path: string, form: Record<string, string>): Promise<TwilioErrorBody> {
    const base = this.cfg.apiBase ?? "https://verify.twilio.com";
    const url = `${base}/v2/Services/${this.cfg.serviceSid}/${path}`;
    const auth = Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString("base64");
    const fetchImpl = this.cfg.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 8_000);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(form),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as TwilioErrorBody;
      if (!res.ok) {
        throw mapTwilioVerifyHttpError(res.status, json);
      }
      return json;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new AuthError("OTP_RATE_LIMITED", "Verification provider timeout");
      }
      throw e instanceof Error ? e : new Error("verify_failed");
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Map Twilio Verify HTTP errors into Wingman AuthError codes (no vendor details to clients). */
export function mapTwilioVerifyHttpError(status: number, body: TwilioErrorBody): AuthError {
  const code = body.code;
  // 60202 max check attempts; 60203 max send attempts; 60212 too many concurrent
  if (code === 60202 || code === 60203 || code === 60212 || status === 429) {
    return new AuthError("OTP_RATE_LIMITED", "Too many OTP attempts");
  }
  // 20404 resource not found / expired verification
  if (code === 20404 || status === 404) {
    return new AuthError("OTP_EXPIRED", "OTP expired");
  }
  // 60200 invalid parameter (often bad phone / code shape)
  if (code === 60200) {
    return new AuthError("PHONE_INVALID", "Invalid phone or verification parameter");
  }
  logVerify({
    msg: "verify.http_error",
    httpStatus: status,
    twilioCode: code,
  });
  return new AuthError("OTP_INVALID", "Verification failed");
}

export function createOtpVerificationFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OtpVerificationProvider | null {
  const mode = (env.OTP_PROVIDER ?? "local").trim().toLowerCase();
  if (mode === "none" || mode === "local" || mode === "sms") {
    return null;
  }
  if (mode === "twilio_verify" || mode === "twilio-verify") {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
    if (!accountSid || !authToken || !serviceSid) {
      // Boot must stay up; block SMS at request time until ops pastes TWILIO_AUTH_TOKEN (never invent).
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          service: "twilio-verify",
          msg: "verify.misconfigured_missing_credentials",
          hasAccountSid: Boolean(accountSid),
          hasAuthToken: Boolean(authToken),
          hasServiceSid: Boolean(serviceSid),
        }),
      );
      return {
        name: "twilio_verify_misconfigured",
        async start() {
          // Not OTP_RATE_LIMITED — UI should surface this message (ops must paste TWILIO_AUTH_TOKEN).
          throw new AuthError("OTP_INVALID", "SMS verification is not configured yet");
        },
        async check() {
          throw new AuthError("OTP_INVALID", "SMS verification is not configured yet");
        },
      };
    }
    return new TwilioVerifyProvider({
      accountSid,
      authToken,
      serviceSid,
      apiBase: env.TWILIO_VERIFY_API_BASE,
      timeoutMs: Number(env.SMS_TIMEOUT_MS ?? 8000),
    });
  }
  throw new Error(`Unknown OTP_PROVIDER=${mode}`);
}
