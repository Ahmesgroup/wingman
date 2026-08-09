/**
 * Ephemeral impression tracker for diversity / rotation.
 * Not durable identity — TTL window only.
 */
export class ExposureStore {
  private impressions = new Map<string, number[]>();

  constructor(private readonly windowMs = 15 * 60 * 1000) {}

  private key(viewerId: string, candidateId: string): string {
    return `${viewerId}:${candidateId}`;
  }

  recordImpression(viewerId: string, candidateId: string, at: Date): void {
    const k = this.key(viewerId, candidateId);
    const arr = this.impressions.get(k) ?? [];
    arr.push(at.getTime());
    this.impressions.set(k, arr);
  }

  recordImpressions(viewerId: string, candidateIds: string[], at: Date): void {
    for (const id of candidateIds) this.recordImpression(viewerId, id, at);
  }

  countRecent(viewerId: string, candidateId: string, now: Date): number {
    const k = this.key(viewerId, candidateId);
    const cutoff = now.getTime() - this.windowMs;
    const arr = (this.impressions.get(k) ?? []).filter((t) => t >= cutoff);
    this.impressions.set(k, arr);
    return arr.length;
  }
}
