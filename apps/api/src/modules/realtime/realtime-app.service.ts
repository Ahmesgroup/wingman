import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { WingmanEngine } from "@wingman/domain";
import { isBlockedEitherWay } from "@wingman/domain";
import {
  connectionRoom,
  createEnvelope,
  EventIdFactory,
  missionRoom,
  radarRoom,
  radarZoneFromCoords,
  RealtimeHub,
  userRoom,
  type RealtimeEnvelope,
  type RealtimeEventType,
} from "@wingman/realtime";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { REALTIME_HUB } from "./realtime.tokens.js";

type RoomListener = (userId: string, rooms: string[]) => void | Promise<void>;

/**
 * Application-layer realtime facade.
 * Gateway and HTTP services publish through this — WS handlers must not call the domain.
 */
@Injectable()
export class RealtimeAppService implements OnModuleInit, OnModuleDestroy {
  private readonly ids = new EventIdFactory();
  /** userId -> current radar zone (ephemeral subscription aid). */
  private radarZones = new Map<string, string>();
  private readonly roomListeners = new Set<RoomListener>();

  constructor(
    @Inject(REALTIME_HUB) private readonly hub: RealtimeHub,
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.hub.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.hub.stop();
  }

  onEnvelope(handler: (envelope: RealtimeEnvelope) => void): () => void {
    return this.hub.onLocal(handler);
  }

  /** Gateway joins/leaves radar rooms when presence zone changes (after WS already connected). */
  onUserRoomsChanged(handler: RoomListener): () => void {
    this.roomListeners.add(handler);
    return () => this.roomListeners.delete(handler);
  }

  async publish(input: {
    type: RealtimeEventType;
    aggregateId: string;
    rooms: string[];
    payload: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<RealtimeEnvelope> {
    const envelope = createEnvelope({ ...input, ids: this.ids });
    await this.hub.publish(envelope);
    return envelope;
  }

  defaultRoomsForUser(userId: string): string[] {
    const rooms = [userRoom(userId)];
    const zone = this.radarZones.get(userId);
    if (zone) rooms.push(radarRoom(zone));
    return rooms;
  }

  private async notifyRoomsChanged(userId: string): Promise<void> {
    const rooms = this.defaultRoomsForUser(userId);
    await Promise.all([...this.roomListeners].map((handler) => Promise.resolve(handler(userId, rooms))));
  }

  /**
   * Presence join/leave/move. Same-zone heartbeats do not broadcast — that would
   * force every nearby client to refetch candidates every ~40s.
   */
  async noteRadarPresence(userId: string, lat: number, lng: number, online: boolean): Promise<void> {
    const zone = radarZoneFromCoords(lat, lng);
    const prevZone = this.radarZones.get(userId);
    const nextZone = online ? zone : undefined;
    const zoneChanged = prevZone !== nextZone;
    if (online) this.radarZones.set(userId, zone);
    else this.radarZones.delete(userId);
    if (zoneChanged) await this.notifyRoomsChanged(userId);
    if (!zoneChanged && online) return;

    const rooms = new Set<string>([userRoom(userId), radarRoom(zone)]);
    if (prevZone && prevZone !== zone) rooms.add(radarRoom(prevZone));
    const reason = !online ? "leave" : prevZone && prevZone !== zone ? "move" : "presence";
    await this.publish({
      type: "presence.changed",
      aggregateId: userId,
      rooms: [...rooms],
      payload: { userId, online, zone, reason },
    });
    await this.publish({
      type: "radar.changed",
      aggregateId: zone,
      rooms: [...rooms],
      payload: { zone, reason },
    });
  }

  /** Safety block (and similar) must drop markers without waiting for the next poll. */
  async publishRadarChanged(input: { reason: string; userIds: string[] }): Promise<RealtimeEnvelope> {
    const rooms = new Set<string>();
    const zones = new Set<string>();
    for (const uid of input.userIds) {
      rooms.add(userRoom(uid));
      const z = this.radarZones.get(uid);
      if (z) {
        rooms.add(radarRoom(z));
        zones.add(z);
      }
    }
    const zone = [...zones][0] ?? "block";
    return this.publish({
      type: "radar.changed",
      aggregateId: zone,
      rooms: [...rooms],
      payload: { zone, reason: input.reason },
    });
  }

  canSubscribeConnection(userId: string, connectionId: string): boolean {
    const c = this.engine.connections.get(connectionId);
    if (!c) return false;
    if (c.initiatorId !== userId && c.recipientId !== userId) return false;
    if (isBlockedEitherWay(this.engine.blocks, c.initiatorId, c.recipientId)) return false;
    return true;
  }

  canSubscribeMission(userId: string, missionId: string): boolean {
    return this.canSubscribeConnection(userId, missionId);
  }

  filterRoomsForUser(userId: string, rooms: string[]): string[] {
    return rooms.filter((room) => {
      if (room === userRoom(userId)) return true;
      if (room.startsWith("radar:")) return true;
      if (room.startsWith("connection:")) {
        return this.canSubscribeConnection(userId, room.slice("connection:".length));
      }
      if (room.startsWith("mission:")) {
        return this.canSubscribeMission(userId, room.slice("mission:".length));
      }
      return false;
    });
  }

  resume(userId: string, lastEventId: string | undefined, extraRooms: string[]): {
    events: RealtimeEnvelope[];
    snapshot: { radarZone: string | null; connections: string[] };
  } {
    const rooms = this.filterRoomsForUser(userId, [
      ...this.defaultRoomsForUser(userId),
      ...extraRooms,
    ]);
    const events = this.hub.replay.since(lastEventId, rooms).filter((ev) => {
      return ev.type !== "radar.changed" && ev.type !== "presence.changed";
    });
    const connections = [...this.engine.connections.values()]
      .filter(
        (c) =>
          c.isActive &&
          (c.initiatorId === userId || c.recipientId === userId) &&
          !isBlockedEitherWay(this.engine.blocks, c.initiatorId, c.recipientId),
      )
      .map((c) => c.id);
    return {
      events,
      snapshot: {
        radarZone: this.radarZones.get(userId) ?? null,
        connections,
      },
    };
  }

  connectionRoom = connectionRoom;
  missionRoom = missionRoom;
  userRoom = userRoom;
  radarRoom = radarRoom;
}
