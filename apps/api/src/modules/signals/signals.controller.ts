import { Body, Controller, Inject, Injectable, Param, Post } from "@nestjs/common";
import { CreateSignalSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import type { EphemeralStore } from "@wingman/ephemeral";
import { NotificationOrchestrator, type PushEvent } from "@wingman/notifications";
import { CurrentUser, IdempotencyKey } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { EPHEMERAL_STORE, NOTIFICATION_ORCH } from "../infra/infra.tokens.js";

@Injectable()
export class SignalsService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(EPHEMERAL_STORE) private readonly ephemeral: EphemeralStore,
    @Inject(NOTIFICATION_ORCH) private readonly notifications: NotificationOrchestrator,
  ) {}

  create(
    userId: string,
    body: { receiverId: string; source: "RADAR" | "DESTINY" | "REMATCH" },
    idem?: string,
  ) {
    const signal = this.engine.sendSignal(userId, body.receiverId, idem, body.source);
    const event: PushEvent = {
      id: `push_${signal.id}`,
      type: "signal.received",
      userId: body.receiverId,
      idempotencyKey: `signal.received:${signal.id}`,
      deepLink: this.notifications.deepLinkFor("signal.received", signal.id),
      payload: { signalId: signal.id },
      createdAt: new Date(),
    };
    this.notifications.enqueue(event);
    void this.notifications.processQueue();
    void this.ephemeral.publish(
      "wingman.events",
      JSON.stringify({ type: "signal.received", signalId: signal.id }),
    );
    return { signal };
  }

  open(id: string, userId: string) {
    return this.engine.openSignal(id, userId);
  }

  refuse(id: string, userId: string) {
    return this.engine.refuseSignal(id, userId);
  }

  cancel(id: string, userId: string) {
    return this.engine.cancelSignal(id, userId);
  }

  async accept(id: string, userId: string) {
    const lockKey = `signal-accept:${id}`;
    const owner = `api:${process.pid}:${userId}`;
    const got = await this.ephemeral.acquireLock(lockKey, owner, 15);
    if (!got) {
      // Another instance won — try read-only path via domain (will fail if already accepted)
      return this.engine.acceptSignal(id, userId);
    }
    try {
      const connection = this.engine.acceptSignal(id, userId);
      this.notifications.enqueue({
        id: `push_conn_${connection.id}`,
        type: "connection.confirmed",
        userId: connection.initiatorId,
        idempotencyKey: `connection.created:${connection.id}`,
        deepLink: this.notifications.deepLinkFor("connection.confirmed", connection.id),
        payload: { connectionId: connection.id },
        createdAt: new Date(),
      });
      void this.notifications.processQueue();
      return connection;
    } finally {
      await this.ephemeral.releaseLock(lockKey, owner);
    }
  }
}

@Controller("signals")
export class SignalsController {
  constructor(private readonly signals: SignalsService) {}

  @Post()
  create(
    @CurrentUser() userId: string,
    @IdempotencyKey() idem: string | undefined,
    @Body(new ZodValidationPipe(CreateSignalSchema))
    body: { receiverId: string; source: "RADAR" | "DESTINY" | "REMATCH" },
  ) {
    return this.signals.create(userId, body, idem);
  }

  @Post(":id/open")
  open(@CurrentUser() userId: string, @Param("id") id: string) {
    return { signal: this.signals.open(id, userId) };
  }

  @Post(":id/refuse")
  refuse(@CurrentUser() userId: string, @Param("id") id: string) {
    return { signal: this.signals.refuse(id, userId) };
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() userId: string, @Param("id") id: string) {
    return { signal: this.signals.cancel(id, userId) };
  }

  @Post(":id/accept")
  async accept(@CurrentUser() userId: string, @Param("id") id: string) {
    return { connection: await this.signals.accept(id, userId) };
  }
}
