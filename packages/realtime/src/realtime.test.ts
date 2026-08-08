import { describe, expect, it } from "vitest";
import { createEnvelope, EventIdFactory } from "./envelope.js";
import { RealtimeHub } from "./hub.js";
import { ReplayBuffer } from "./replay-buffer.js";
import { radarZoneFromCoords, userRoom } from "./types.js";
import type { RealtimePublishTransport } from "./hub.js";

describe("S17 realtime transport primitives", () => {
  it("issues monotonic event ids and envelopes", () => {
    const ids = new EventIdFactory();
    const a = ids.next(1000);
    const b = ids.next(1000);
    const c = ids.next(1001);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
    const env = createEnvelope({
      type: "signal.received",
      aggregateId: "sig1",
      rooms: [userRoom("b")],
      payload: { signalId: "sig1" },
      ids,
    });
    expect(env.version).toBe(1);
    expect(env.rooms).toEqual(["user:b"]);
  });

  it("replays only missing events for subscribed rooms", () => {
    const buf = new ReplayBuffer(10);
    const e1 = createEnvelope({
      type: "signal.received",
      aggregateId: "s1",
      rooms: ["user:b"],
      payload: {},
      eventId: "1000-000000",
    });
    const e2 = createEnvelope({
      type: "match.created",
      aggregateId: "c1",
      rooms: ["user:a", "user:b", "connection:c1"],
      payload: {},
      eventId: "1000-000001",
    });
    buf.append(e1);
    buf.append(e2);
    expect(buf.since("1000-000000", ["user:b"]).map((e) => e.eventId)).toEqual(["1000-000001"]);
    expect(buf.since(undefined, ["user:a"]).map((e) => e.type)).toEqual(["match.created"]);
  });

  it("dedupes multi-instance bus fan-out by eventId", async () => {
    const handlers = new Map<string, Set<(p: string) => void>>();
    const transport: RealtimePublishTransport = {
      async publish(channel, payload) {
        for (const h of handlers.get(channel) ?? []) h(payload);
      },
      async subscribe(channel, handler) {
        if (!handlers.has(channel)) handlers.set(channel, new Set());
        handlers.get(channel)!.add(handler);
        return async () => {
          handlers.get(channel)?.delete(handler);
        };
      },
    };
    const hubA = new RealtimeHub(transport, "A");
    const hubB = new RealtimeHub(transport, "B");
    await hubA.start();
    await hubB.start();
    const seenA: string[] = [];
    const seenB: string[] = [];
    hubA.onLocal((e) => seenA.push(e.eventId));
    hubB.onLocal((e) => seenB.push(e.eventId));

    const env = createEnvelope({
      type: "signal.received",
      aggregateId: "s1",
      rooms: ["user:b"],
      payload: {},
      eventId: "2000-000000",
    });
    await hubA.publish(env);
    expect(seenA).toEqual(["2000-000000"]);
    expect(seenB).toEqual(["2000-000000"]);
    await hubA.publish(env);
    expect(seenA).toEqual(["2000-000000"]);
  });

  it("computes coarse radar zones", () => {
    expect(radarZoneFromCoords(48.8566, 2.3522)).toBe("48.857:2.352");
  });
});
