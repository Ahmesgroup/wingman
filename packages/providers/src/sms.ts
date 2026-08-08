export interface SmsMessage {
  toE164: string;
  body: string;
  idempotencyKey: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<{ providerMessageId: string }>;
}

/** Dev/test provider — never prints the OTP code itself when redacted logging is used upstream. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<{ providerMessageId: string }> {
    this.sent.push(message);
    const id = `sms_${this.sent.length}`;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        service: "sms-provider",
        msg: "sms.queued",
        provider: this.name,
        to: "[redacted]",
        idempotencyKey: message.idempotencyKey,
        providerMessageId: id,
      }),
    );
    return { providerMessageId: id };
  }
}

/** Explicit no-op for environments that disable SMS. */
export class NoopSmsProvider implements SmsProvider {
  readonly name = "noop";
  async send(_message: SmsMessage): Promise<{ providerMessageId: string }> {
    return { providerMessageId: "noop" };
  }
}
