export type IdempotencyStatus = "STARTED" | "COMPLETED";

export interface IdempotencyRecord<T = unknown> {
  key: string;
  userId: string;
  route: string;
  status: IdempotencyStatus;
  response?: T;
  createdAt: Date;
}

export class IdempotencyStore<T = unknown> {
  private readonly map = new Map<string, IdempotencyRecord<T>>();

  private id(userId: string, route: string, key: string): string {
    return `${userId}|${route}|${key}`;
  }

  begin(userId: string, route: string, key: string, at: Date): IdempotencyRecord<T> | { replay: T } {
    const k = this.id(userId, route, key);
    const existing = this.map.get(k);
    if (existing?.status === "COMPLETED" && existing.response !== undefined) {
      return { replay: existing.response };
    }
    if (existing?.status === "STARTED") {
      throw new Error("IDEMPOTENCY_IN_FLIGHT");
    }
    const rec: IdempotencyRecord<T> = {
      key,
      userId,
      route,
      status: "STARTED",
      createdAt: at,
    };
    this.map.set(k, rec);
    return rec;
  }

  complete(userId: string, route: string, key: string, response: T): void {
    const k = this.id(userId, route, key);
    const existing = this.map.get(k);
    if (!existing) return;
    this.map.set(k, { ...existing, status: "COMPLETED", response });
  }
}
