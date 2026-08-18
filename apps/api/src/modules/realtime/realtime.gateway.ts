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
  private offRooms: (() => void) | null = null;

  constructor(
    @Inject(RealtimeAppService) private readonly realtime: RealtimeAppService,
    @Inject(AUTH_SERVICE_TOKEN) private readonly auth: AuthService,
  ) {}

  afterInit(): void {
    if (!this.realtime?.onEnvelope) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "realtime.gateway_missing_service",
        }),
      );
      return;
    }
    this.offHub = this.realtime.onEnvelope((envelope) => this.fanOut(envelope));
    this.offRooms = this.realtime.onUserRoomsChanged((userId, rooms) => this.syncUserRooms(userId, rooms));
  }

  handleDisconnect(_client: AuthedSocket): void {
    // socket.io leaves rooms automatically
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    client.data.rooms = new Set();
    const userId = await this.authenticate(client);
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

  private async authenticate(client: Socket): Promise<string | null> {
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
        return (await this.auth.authenticate(bearer, deviceId)).userId;
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

  /** Join radar zone after activate even if the socket connected first (product order). */
  private async syncUserRooms(userId: string, rooms: string[]): Promise<void> {
    if (!this.server) return;
    const wantRadar = new Set(rooms.filter((room) => room.startsWith("radar:")));
    for (const sock of this.server.sockets.sockets.values()) {
      const client = sock as AuthedSocket;
      if (client.data.userId !== userId || !client.data.rooms) continue;
      for (const existing of [...client.data.rooms]) {
        if (existing.startsWith("radar:") && !wantRadar.has(existing)) {
          await client.leave(existing);
          client.data.rooms.delete(existing);
        }
      }
      for (const room of rooms) {
        if (client.data.rooms.has(room)) continue;
        await client.join(room);
        client.data.rooms.add(room);
      }
    }
  }
}
