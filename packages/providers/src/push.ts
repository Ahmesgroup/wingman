import type { PushEvent, PushTransport } from "@wingman/notifications";

export interface DevicePushTarget {
  userId: string;
  deviceId: string;
  platform: "ios" | "android" | "web";
  pushToken: string;
}

/**
 * Production-shaped push transport port.
 * Swap LoggingPushTransport for ApnsFcmTransport later without touching domain.
 */
export class LoggingPushTransport implements PushTransport {
  sent: PushEvent[] = [];

  async send(event: PushEvent): Promise<void> {
    this.sent.push(event);
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        service: "push-provider",
        msg: "push.sent",
        type: event.type,
        userId: event.userId,
        idempotencyKey: event.idempotencyKey,
        deepLink: event.deepLink,
      }),
    );
  }
}

/** Fails closed for tests that assert retry/DLQ behavior. */
export class FlakyPushTransport implements PushTransport {
  constructor(private readonly failuresBeforeSuccess: number) {}
  attempts = 0;
  sent: PushEvent[] = [];

  async send(event: PushEvent): Promise<void> {
    this.attempts += 1;
    if (this.attempts <= this.failuresBeforeSuccess) {
      throw new Error("push upstream unavailable");
    }
    this.sent.push(event);
  }
}
