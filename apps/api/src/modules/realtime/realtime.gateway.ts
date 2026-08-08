import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthService } from "@wingman/auth";
import type { RealtimeEnvelope } from "@wingman/realtime";
import type { Server, Socket } from "socket.io";
import { AUTH_SERVICE_TOKEN } from "../infra/infra.tokens.js";
import { RealtimeAppService } from "./realtime-app.service.js";

type AuthedSocket = Socket & { data: { userId?: string; rooms: Set<string> } };

/**
 * WebSocket transport gateway — no domain imports.
 * Auth + subscribe/resume only; protocol mutations stay on HTTP application services.
 */
@Injectable()
@WebSocketGateway({
  path: "/ws",
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private offHub: (() => void) | null = null;

  constructor(
    private readonly realtime: RealtimeAppService,
    @Inject(AUTH_SERVICE_TOKEN) private readonly auth: AuthService,
  ) {}

  afterInit(): void {
    this.offHub = this.realtime.onEnvelope((envelope) => this.fanOut(envelope));
  }

  handleDisconnect(_client: AuthedSocket): void {
    // socket.io leaves rooms automatically
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    client.data.rooms = new Set();
    const userId = this.authenticate(client);
    if (!userId) {
      client.emit("error", { code: "UNAUTHORIZED", message: "Socket auth required" });
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    for (const room of this.realtime.defaultRoomsForUser(userId)) {
      await client.join(room);
      client.data.rooms.add(room);
    }
    client.emit("ready", {
      userId,
      rooms: [...client.data.rooms],
      serverTime: new Date().toISOString(),
    });
  }

  @SubscribeMessage("subscribe")
  async onSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { connectionId?: string; missionId?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { ok: false, code: "UNAUTHORIZED" };
    const joined: string[] = [];
    if (body.connectionId) {
      if (!this.realtime.canSubscribeConnection(userId, body.connectionId)) {
        return { ok: false, code: "FORBIDDEN", room: `connection:${body.connectionId}` };
      }
      const room = this.realtime.connectionRoom(body.connectionId);
      await client.join(room);
      client.data.rooms.add(room);
      joined.push(room);
    }
    if (body.missionId) {
      if (!this.realtime.canSubscribeMission(userId, body.missionId)) {
        return { ok: false, code: "FORBIDDEN", room: `mission:${body.missionId}` };
      }
      const room = this.realtime.missionRoom(body.missionId);
      await client.join(room);
      client.data.rooms.add(room);
      joined.push(room);
    }
    return { ok: true, joined };
  }

  @SubscribeMessage("resume")
  onResume(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { lastEventId?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return { ok: false, code: "UNAUTHORIZED" };
    const { events, snapshot } = this.realtime.resume(userId, body.lastEventId, [...client.data.rooms]);
    for (const ev of events) client.emit("event", ev);
    client.emit("snapshot", snapshot);
    return { ok: true, replayed: events.length, snapshot };
  }

  @SubscribeMessage("ping")
  onPing() {
    return { ok: true, serverTime: new Date().toISOString() };
  }

  private authenticate(client: Socket): string | null {
    const auth = client.handshake.auth as {
      token?: string;
      deviceId?: string;
      userId?: string;
    };
    const headers = client.handshake.headers;
    const bearer =
      typeof headers.authorization === "string" && headers.authorization.startsWith("Bearer ")
        ? headers.authorization.slice("Bearer ".length)
        : auth.token;
    const deviceId =
      (typeof headers["x-device-id"] === "string" ? headers["x-device-id"] : undefined) ?? auth.deviceId;

    if (bearer) {
      try {
        return this.auth.authenticate(bearer, deviceId).userId;
      } catch {
        return null;
      }
    }
    if (process.env.AUTH_ALLOW_DEV === "true") {
      const devUser =
        auth.userId ??
        (typeof headers["x-user-id"] === "string" ? headers["x-user-id"] : undefined);
      if (devUser) return devUser;
    }
    return null;
  }

  private fanOut(envelope: RealtimeEnvelope): void {
    if (!this.server) return;
    for (const room of envelope.rooms) {
      this.server.to(room).emit("event", envelope);
    }
  }
}
