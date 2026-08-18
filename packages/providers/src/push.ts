import type { PushEvent, PushSendResult, PushTransport } from "@wingman/notifications";
import { InvalidDeviceError } from "@wingman/notifications";
import type { DeviceTokenStore, PushPlatform } from "./device-tokens.js";

export interface MobilePushMessage {
  token: string;
  platform: PushPlatform;
  title: string;
  body: string;
  deepLink: string;
  data: Record<string, unknown>;
  idempotencyKey: string;
}

export interface MobilePushProvider {
  readonly name: string;
  readonly platforms: PushPlatform[];
  send(message: MobilePushMessage): Promise<PushSendResult>;
}

export class LoggingPushTransport implements PushTransport {
  sent: PushEvent[] = [];

  async send(event: PushEvent): Promise<PushSendResult> {
    this.sent.push(event);
    const providerMessageId = `log_${this.sent.length}`;
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
        providerMessageId,
      }),
    );
    return { providerMessageId };
  }
}

export class FlakyPushTransport implements PushTransport {
  constructor(private readonly failuresBeforeSuccess: number) {}
  attempts = 0;
  sent: PushEvent[] = [];

  async send(event: PushEvent): Promise<PushSendResult> {
    this.attempts += 1;
    if (this.attempts <= this.failuresBeforeSuccess) {
      throw new Error("push upstream unavailable");
    }
    this.sent.push(event);
    return { providerMessageId: `flaky_${this.attempts}` };
  }
}

/** Simulated FCM — production-shaped; marks configured tokens as invalid. */
export class FcmPushProvider implements MobilePushProvider {
  readonly name = "fcm";
  readonly platforms: PushPlatform[] = ["android", "web"];
  sent: MobilePushMessage[] = [];
  invalidTokens = new Set<string>();

  constructor(
    private readonly opts: {
      projectId?: string;
      fetchImpl?: typeof fetch;
      /** When set, real HTTP is attempted; otherwise simulate. */
      serverKey?: string;
    } = {},
  ) {}

  markInvalid(token: string): void {
    this.invalidTokens.add(token);
  }

  async send(message: MobilePushMessage): Promise<PushSendResult> {
    if (this.invalidTokens.has(message.token)) {
      throw new InvalidDeviceError(message.token);
    }
    if (this.opts.serverKey && this.opts.fetchImpl) {
      // Optional real path left for staging; tests use simulation.
      const res = await this.opts.fetchImpl("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${this.opts.serverKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: message.token,
          notification: { title: message.title, body: message.body },
          data: { ...message.data, deepLink: message.deepLink },
        }),
      });
      if (res.status === 404 || res.status === 410) throw new InvalidDeviceError(message.token);
      if (!res.ok) throw new Error(`fcm_http_${res.status}`);
      const json = (await res.json()) as { message_id?: string };
      return { providerMessageId: String(json.message_id ?? `fcm_${Date.now()}`) };
    }
    this.sent.push(message);
    return { providerMessageId: `fcm_sim_${this.sent.length}` };
  }
}

/** Simulated APNs — production-shaped. */
export class ApnsPushProvider implements MobilePushProvider {
  readonly name = "apns";
  readonly platforms: PushPlatform[] = ["ios"];
  sent: MobilePushMessage[] = [];
  invalidTokens = new Set<string>();

  markInvalid(token: string): void {
    this.invalidTokens.add(token);
  }

  async send(message: MobilePushMessage): Promise<PushSendResult> {
    if (this.invalidTokens.has(message.token)) {
      throw new InvalidDeviceError(message.token);
    }
    this.sent.push(message);
    return { providerMessageId: `apns_sim_${this.sent.length}` };
  }
}

/** Privacy-safe copy: never phone numbers, selfies, or chat text. */
export function publicPushCopy(type: string): { title: string; body: string } {
  switch (type) {
    case "signal.received":
      return { title: "Wingman", body: "Someone nearby reached out" };
    case "mission.message":
      return { title: "Wingman", body: "New message in your meeting" };
    case "match.created":
    case "connection.confirmed":
      return { title: "Wingman", body: "You’re connected" };
    case "mission.updated":
    case "mission.opened":
      return { title: "Wingman", body: "Your meeting has an update" };
    case "mission.expired":
      return { title: "Wingman", body: "This meeting ended" };
    default:
      return { title: "Wingman", body: "You have a new update" };
  }
}

export function payloadLooksPrivate(payload: Record<string, unknown> | string | undefined): boolean {
  const blob = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  if (/\+\d{8,}/.test(blob)) return true;
  if (/selfie|mediaUrl|phoneE164|phoneNumber/i.test(blob)) return true;
  return false;
}

export function sanitizePushPayload(
  type: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  const copy = publicPushCopy(type);
  const out: Record<string, unknown> = { summary: copy.body };
  if (typeof payload.signalId === "string") out.signalId = payload.signalId;
  if (typeof payload.connectionId === "string") out.connectionId = payload.connectionId;
  return out;
}

export type WebPushCapability = {
  enabled: boolean;
  provider: "vapid" | "fcm" | "none";
  reason?: string;
  vapidPublicKey?: string | null;
};

export function webPushCapabilityFromEnv(env: NodeJS.ProcessEnv = process.env): WebPushCapability {
  const vapidPublic = (env.VAPID_PUBLIC_KEY || env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const vapidPrivate = (env.VAPID_PRIVATE_KEY || env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const fcmKey = (env.FCM_SERVER_KEY || "").trim();
  const fcmProject = (env.FCM_PROJECT_ID || "").trim();
  const fcmVapid = (env.FCM_VAPID_KEY || env.FIREBASE_VAPID_KEY || "").trim();
  if (vapidPublic && vapidPrivate) {
    return { enabled: true, provider: "vapid", vapidPublicKey: vapidPublic };
  }
  if (fcmKey && fcmProject && fcmVapid) {
    return { enabled: true, provider: "fcm", vapidPublicKey: fcmVapid };
  }
  return {
    enabled: false,
    provider: "none",
    reason: "vapid_or_fcm_credentials_missing",
    vapidPublicKey: null,
  };
}

/** Honest no-send when web push credentials are missing. Never reports SENT. */
export class FailClosedWebPushTransport implements PushTransport {
  constructor(public readonly reason = "vapid_or_fcm_credentials_missing") {}

  async send(_event: PushEvent): Promise<PushSendResult> {
    throw new Error(`WEB_PUSH_BLOCKED:${this.reason}`);
  }
}

/**
 * Resolves active device tokens and fans out via FCM/APNs.
 * Implements PushTransport so NotificationOrchestrator stays vendor-agnostic.
 */
export class MobilePushTransport implements PushTransport {
  constructor(
    private readonly tokens: DeviceTokenStore,
    private readonly providers: MobilePushProvider[],
  ) {}

  async send(event: PushEvent): Promise<PushSendResult> {
    const devices = await this.tokens.listActiveForUser(event.userId);
    if (devices.length === 0) {
      // No device — treat as soft success so orchestrator does not retry forever.
      return { providerMessageId: "no_device" };
    }
    let lastId: string | undefined;
    let anySent = false;
    const errors: string[] = [];
    for (const device of devices) {
      const provider = this.providers.find((p) => p.platforms.includes(device.platform));
      if (!provider) continue;
      try {
        const copy = publicPushCopy(event.type);
        const data = sanitizePushPayload(event.type, event.payload);
        const result = await provider.send({
          token: device.pushToken,
          platform: device.platform,
          title: copy.title,
          body: copy.body,
          deepLink: event.deepLink,
          data,
          idempotencyKey: `${event.idempotencyKey}:${device.deviceId}`,
        });
        lastId = result.providerMessageId ?? lastId;
        anySent = true;
      } catch (e) {
        if (e instanceof InvalidDeviceError) {
          await this.tokens.deactivateToken(e.token, "provider_invalid");
          errors.push(`invalid:${e.token}`);
          continue;
        }
        errors.push(e instanceof Error ? e.message : "push_failed");
      }
    }
    if (!anySent && errors.some((e) => e.startsWith("invalid:"))) {
      throw new InvalidDeviceError(errors.find((e) => e.startsWith("invalid:"))!.slice("invalid:".length));
    }
    if (!anySent && errors.length > 0) {
      throw new Error(errors[0]);
    }
    return { providerMessageId: lastId };
  }
}

export function createMobilePushTransportFromEnv(
  tokens: DeviceTokenStore,
  env: NodeJS.ProcessEnv = process.env,
): PushTransport {
  const mode = env.PUSH_PROVIDER ?? "memory";
  if (mode === "logging") return new LoggingPushTransport();
  if (mode === "web") {
    const web = webPushCapabilityFromEnv(env);
    return new FailClosedWebPushTransport(web.reason ?? "web_push_sender_not_provisioned");
  }
  const fcm = new FcmPushProvider({
    projectId: env.FCM_PROJECT_ID,
    serverKey: env.FCM_SERVER_KEY,
    fetchImpl: env.FCM_SERVER_KEY ? fetch : undefined,
  });
  const apns = new ApnsPushProvider();
  if (mode === "mobile" || mode === "fcm" || mode === "apns") {
    return new MobilePushTransport(tokens, [fcm, apns]);
  }
  return new LoggingPushTransport();
}
