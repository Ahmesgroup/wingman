export type PushEventType = "signal.received" | "connection.confirmed" | "mission.opened" | "destiny.prompt";

export interface PushEvent {
  id: string;
  type: PushEventType;
  userId: string;
  idempotencyKey: string;
  deepLink: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface DeliveryRecord {
  idempotencyKey: string;
  status: "PENDING" | "SENT" | "FAILED" | "DEAD";
  attempts: number;
  lastError?: string;
}

export interface PushTransport {
  send(event: PushEvent): Promise<void>;
}

export class InMemoryPushTransport implements PushTransport {
  sent: PushEvent[] = [];
  failNext = false;

  async send(event: PushEvent): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("push transport failure");
    }
    this.sent.push(event);
  }
}

/**
 * Notification orchestrator: idempotent delivery, retries, dead-letter.
 * Does not contain Wingman protocol rules.
 */
export class NotificationOrchestrator {
  private deliveries = new Map<string, DeliveryRecord>();
  private dlq: PushEvent[] = [];
  private queue: PushEvent[] = [];

  constructor(
    private readonly transport: PushTransport,
    private readonly maxAttempts = 3,
  ) {}

  enqueue(event: PushEvent): { accepted: boolean; duplicate: boolean } {
    const existing = this.deliveries.get(event.idempotencyKey);
    if (existing && (existing.status === "SENT" || existing.status === "PENDING")) {
      return { accepted: false, duplicate: true };
    }
    this.deliveries.set(event.idempotencyKey, {
      idempotencyKey: event.idempotencyKey,
      status: "PENDING",
      attempts: 0,
    });
    this.queue.push(event);
    return { accepted: true, duplicate: false };
  }

  async processQueue(): Promise<void> {
    const batch = this.queue.splice(0, this.queue.length);
    for (const event of batch) {
      await this.deliver(event);
    }
  }

  private async deliver(event: PushEvent): Promise<void> {
    const rec = this.deliveries.get(event.idempotencyKey);
    if (!rec || rec.status === "SENT") return;
    rec.attempts += 1;
    try {
      await this.transport.send(event);
      rec.status = "SENT";
    } catch (e) {
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

  getDelivery(idempotencyKey: string): DeliveryRecord | undefined {
    return this.deliveries.get(idempotencyKey);
  }

  deepLinkFor(type: PushEventType, id: string): string {
    switch (type) {
      case "signal.received":
        return `wingman://signals/${id}`;
      case "connection.confirmed":
        return `wingman://connections/${id}`;
      case "mission.opened":
        return `wingman://missions/${id}`;
      case "destiny.prompt":
        return `wingman://destiny/${id}`;
    }
  }
}
