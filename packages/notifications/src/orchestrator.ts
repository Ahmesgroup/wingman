export type AppNotificationType =
  | "signal.received"
  | "connection.confirmed"
  | "match.created"
  | "mission.opened"
  | "mission.updated"
  | "mission.expired"
  | "destiny.prompt";

/** @deprecated use AppNotificationType — kept for existing call sites */
export type PushEventType = AppNotificationType;

export interface PushEvent {
  id: string;
  type: AppNotificationType;
  userId: string;
  idempotencyKey: string;
  deepLink: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "INVALID_DEVICE" | "DEAD";

export interface NotificationRecord {
  notificationId: string;
  idempotencyKey: string;
  status: NotificationStatus;
  attempts: number;
  channel: "push";
  userId: string;
  type: AppNotificationType;
  providerMessageId?: string;
  lastError?: string;
}

/** @deprecated alias */
export type DeliveryRecord = NotificationRecord;

export interface PushSendResult {
  providerMessageId?: string;
}

export interface PushTransport {
  send(event: PushEvent): Promise<PushSendResult | void>;
}

export class InvalidDeviceError extends Error {
  readonly code = "INVALID_DEVICE";
  constructor(public readonly token: string) {
    super("INVALID_DEVICE");
    this.name = "InvalidDeviceError";
  }
}

export class InMemoryPushTransport implements PushTransport {
  sent: PushEvent[] = [];
  failNext = false;

  async send(event: PushEvent): Promise<PushSendResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("push transport failure");
    }
    this.sent.push(event);
    return { providerMessageId: `mem_${this.sent.length}` };
  }
}

/**
 * Channel notification orchestrator (push).
 * Decides delivery/retry only — never protocol rules.
 * Provider outages surface as FAILED/DEAD without throwing to callers of enqueue.
 */
export class NotificationOrchestrator {
  private deliveries = new Map<string, NotificationRecord>();
  private dlq: PushEvent[] = [];
  private queue: PushEvent[] = [];
  private seq = 0;

  constructor(
    private readonly transport: PushTransport,
    private readonly maxAttempts = 3,
  ) {}

  enqueue(event: PushEvent): { accepted: boolean; duplicate: boolean; notificationId?: string } {
    const existing = this.deliveries.get(event.idempotencyKey);
    if (existing && (existing.status === "SENT" || existing.status === "PENDING")) {
      return { accepted: false, duplicate: true, notificationId: existing.notificationId };
    }
    this.seq += 1;
    const notificationId = `ntf_${this.seq}_${event.id}`;
    this.deliveries.set(event.idempotencyKey, {
      notificationId,
      idempotencyKey: event.idempotencyKey,
      status: "PENDING",
      attempts: 0,
      channel: "push",
      userId: event.userId,
      type: event.type,
    });
    this.queue.push(event);
    return { accepted: true, duplicate: false, notificationId };
  }

  /**
   * Map application events to push jobs.
   * Domain/realtime already decided what happened; this only chooses the push channel.
   */
  handleAppEvent(input: {
    type: AppNotificationType;
    userId: string;
    aggregateId: string;
    payload?: Record<string, unknown>;
  }): { accepted: boolean; duplicate: boolean; notificationId?: string } {
    const event: PushEvent = {
      id: input.aggregateId,
      type: input.type,
      userId: input.userId,
      idempotencyKey: `${input.type}:${input.aggregateId}:${input.userId}`,
      deepLink: this.deepLinkFor(input.type, input.aggregateId),
      payload: input.payload ?? {},
      createdAt: new Date(),
    };
    return this.enqueue(event);
  }

  async processQueue(): Promise<void> {
    const batch = this.queue.splice(0, this.queue.length);
    for (const event of batch) {
      await this.deliver(event);
    }
  }

  private async deliver(event: PushEvent): Promise<void> {
    const rec = this.deliveries.get(event.idempotencyKey);
    if (!rec || rec.status === "SENT" || rec.status === "INVALID_DEVICE") return;
    rec.attempts += 1;
    try {
      const result = await this.transport.send(event);
      rec.status = "SENT";
      if (result && typeof result === "object" && "providerMessageId" in result) {
        rec.providerMessageId = result.providerMessageId;
      }
    } catch (e) {
      if (e instanceof InvalidDeviceError) {
        rec.status = "INVALID_DEVICE";
        rec.lastError = e.message;
        rec.providerMessageId = undefined;
        return;
      }
      rec.lastError = e instanceof Error ? e.message : "unknown";
      if (rec.attempts >= this.maxAttempts) {
        rec.status = "DEAD";
        this.dlq.push(event);
      } else {
        rec.status = "PENDING";
        this.queue.push(event);
      }
    }
  }

  getDeadLetters(): PushEvent[] {
    return [...this.dlq];
  }

  getDelivery(idempotencyKey: string): NotificationRecord | undefined {
    return this.deliveries.get(idempotencyKey);
  }

  listDeliveries(): NotificationRecord[] {
    return [...this.deliveries.values()];
  }

  deepLinkFor(type: AppNotificationType, id: string): string {
    switch (type) {
      case "signal.received":
        return `wingman://signals/${id}`;
      case "connection.confirmed":
      case "match.created":
        return `wingman://connections/${id}`;
      case "mission.opened":
      case "mission.updated":
      case "mission.expired":
        return `wingman://missions/${id}`;
      case "destiny.prompt":
        return `wingman://destiny/${id}`;
    }
  }
}
