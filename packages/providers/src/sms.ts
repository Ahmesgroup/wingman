export interface SmsMessage {
  toE164: string;
  body: string;
  idempotencyKey: string;
}

export interface SmsSendResult {
  providerMessageId: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

function logSms(event: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      service: "sms-provider",
      to: "[redacted]",
      ...event,
      // never echo OTP body
      body: undefined,
    }),
  );
}

/** Dev/test provider — logs metadata only, never OTP body. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<SmsSendResult> {
    this.sent.push(message);
    const id = `sms_console_${this.sent.length}`;
    logSms({ msg: "sms.queued", provider: this.name, idempotencyKey: message.idempotencyKey, providerMessageId: id });
    return { providerMessageId: id };
  }
}

/** Explicit no-op when SMS is disabled. */
export class NoopSmsProvider implements SmsProvider {
  readonly name = "noop";
  async send(_message: SmsMessage): Promise<SmsSendResult> {
    return { providerMessageId: "noop" };
  }
}

export type TwilioSmsConfig = {
  accountSid: string;
  authToken: string;
  fromE164: string;
  apiBase?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Production Twilio SMS adapter (HTTP).
 * No Twilio SDK import — keeps @wingman/providers free of heavy vendor SDKs.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";

  constructor(private readonly cfg: TwilioSmsConfig) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const base = this.cfg.apiBase ?? "https://api.twilio.com";
    const url = `${base}/2010-04-01/Accounts/${this.cfg.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: message.toE164,
      From: this.cfg.fromE164,
      Body: message.body,
    });
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
          "Idempotency-Key": message.idempotencyKey,
        },
        body,
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) {
        throw new Error(json.message ?? `twilio_http_${res.status}`);
      }
      const providerMessageId = json.sid ?? `twilio_${Date.now()}`;
      logSms({
        msg: "sms.sent",
        provider: this.name,
        idempotencyKey: message.idempotencyKey,
        providerMessageId,
      });
      return { providerMessageId };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Timeout + bounded retries + in-memory idempotence for SMS delivery.
 * Never logs message body (OTP-safe).
 */
export class ReliableSmsProvider implements SmsProvider {
  readonly name: string;
  private readonly completed = new Map<string, SmsSendResult>();

  constructor(
    private readonly inner: SmsProvider,
    private readonly opts: { maxAttempts?: number; timeoutMs?: number } = {},
  ) {
    this.name = `reliable:${inner.name}`;
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const cached = this.completed.get(message.idempotencyKey);
    if (cached) return cached;

    const maxAttempts = this.opts.maxAttempts ?? 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.withTimeout(() => this.inner.send(message));
        this.completed.set(message.idempotencyKey, result);
        if (this.completed.size > 5000) {
          const first = this.completed.keys().next().value;
          if (first) this.completed.delete(first);
        }
        return result;
      } catch (e) {
        lastError = e;
        logSms({
          msg: "sms.retry",
          provider: this.inner.name,
          idempotencyKey: message.idempotencyKey,
          attempt,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }
    throw lastError instanceof Error ? lastError : new Error("sms_failed");
  }

  private withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    const ms = this.opts.timeoutMs ?? 8_000;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("sms_timeout")), ms);
      fn()
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(t);
          reject(e);
        });
    });
  }
}

export function createSmsProviderFromEnv(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  const mode = env.SMS_PROVIDER ?? "console";
  if (mode === "noop") return new NoopSmsProvider();
  if (mode === "twilio") {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const fromE164 = env.TWILIO_FROM_E164;
    if (!accountSid || !authToken || !fromE164) {
      throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_E164 required for SMS_PROVIDER=twilio");
    }
    return new ReliableSmsProvider(
      new TwilioSmsProvider({
        accountSid,
        authToken,
        fromE164,
        apiBase: env.TWILIO_API_BASE,
        timeoutMs: Number(env.SMS_TIMEOUT_MS ?? 8000),
      }),
      { maxAttempts: Number(env.SMS_MAX_ATTEMPTS ?? 3), timeoutMs: Number(env.SMS_TIMEOUT_MS ?? 8000) },
    );
  }
  // console with optional reliable wrapper when SMS_RELIABLE=true
  const consoleProvider = new ConsoleSmsProvider();
  if (env.SMS_RELIABLE === "true") return new ReliableSmsProvider(consoleProvider);
  return consoleProvider;
}
