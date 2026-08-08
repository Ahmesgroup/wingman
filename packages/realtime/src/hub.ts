import type { RealtimeEnvelope } from "./types.js";
import { ReplayBuffer } from "./replay-buffer.js";

export type RealtimePublishTransport = {
  publish(channel: string, payload: string): Promise<void>;
  subscribe(channel: string, handler: (payload: string) => void): Promise<() => Promise<void>>;
};

export const REALTIME_BUS_CHANNEL = "wingman.realtime";

type LocalHandler = (envelope: RealtimeEnvelope) => void;

/**
 * Fan-out hub: local socket delivery + optional Redis/memory pub-sub for multi-instance.
 * Dedupes by eventId so the originating instance does not double-deliver.
 */
export class RealtimeHub {
  readonly replay = new ReplayBuffer();
  private localHandlers = new Set<LocalHandler>();
  private seen = new Set<string>();
  private unsub: (() => Promise<void>) | null = null;
  readonly instanceId: string;

  constructor(
    private readonly transport?: RealtimePublishTransport,
    instanceId = `inst_${process.pid}_${Math.random().toString(36).slice(2, 8)}`,
  ) {
    this.instanceId = instanceId;
  }

  onLocal(handler: LocalHandler): () => void {
    this.localHandlers.add(handler);
    return () => this.localHandlers.delete(handler);
  }

  async start(): Promise<void> {
    if (!this.transport || this.unsub) return;
    this.unsub = await this.transport.subscribe(REALTIME_BUS_CHANNEL, (payload) => {
      try {
        const parsed = JSON.parse(payload) as RealtimeEnvelope & { originInstanceId?: string };
        if (parsed.originInstanceId === this.instanceId) return;
        this.deliver(parsed, false);
      } catch {
        // ignore malformed bus messages
      }
    });
  }

  async stop(): Promise<void> {
    if (this.unsub) {
      await this.unsub();
      this.unsub = null;
    }
  }

  async publish(envelope: RealtimeEnvelope): Promise<void> {
    this.deliver(envelope, true);
    if (this.transport) {
      await this.transport.publish(
        REALTIME_BUS_CHANNEL,
        JSON.stringify({ ...envelope, originInstanceId: this.instanceId }),
      );
    }
  }

  private deliver(envelope: RealtimeEnvelope, recordReplay: boolean): void {
    if (this.seen.has(envelope.eventId)) return;
    this.seen.add(envelope.eventId);
    if (this.seen.size > 5000) {
      const drop = [...this.seen].slice(0, 1000);
      for (const id of drop) this.seen.delete(id);
    }
    if (recordReplay) this.replay.append(envelope);
    for (const h of this.localHandlers) h(envelope);
  }
}
