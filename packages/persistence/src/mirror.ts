import type { WingmanEngine } from "@wingman/domain";
import type { ProtocolRepository } from "./protocol-repository.js";

/**
 * Mirrors domain mutations into a ProtocolRepository after the fact.
 * Never mutates protocol state itself.
 */
export class ProtocolPersistenceMirror {
  constructor(
    private readonly engine: WingmanEngine,
    private readonly repo: ProtocolRepository,
  ) {}

  async mirrorUser(userId: string): Promise<void> {
    const user = this.engine.users.get(userId);
    if (user) await this.repo.upsertUser(user);
  }

  async mirrorSignal(signalId: string): Promise<void> {
    const signal = this.engine.signals.get(signalId);
    if (signal) await this.repo.saveSignal(signal);
  }

  async mirrorConnection(connectionId: string): Promise<void> {
    const connection = this.engine.connections.get(connectionId);
    if (connection) await this.repo.saveConnection(connection);
  }

  async mirrorPresence(userId: string): Promise<void> {
    const presence = this.engine.presence.get(userId);
    if (!presence) return;
    await this.repo.savePresence(userId, presence, this.engine.locations.get(userId));
  }

  async mirrorLatestBlock(): Promise<void> {
    const block = this.engine.blocks[this.engine.blocks.length - 1];
    if (block) await this.repo.saveBlock(block);
  }

  async mirrorLatestReport(): Promise<void> {
    const report = this.engine.reports[this.engine.reports.length - 1];
    if (report) await this.repo.saveReport(report);
  }

  async mirrorLatestConsent(): Promise<void> {
    const consent = this.engine.consents[this.engine.consents.length - 1];
    if (consent) await this.repo.saveConsent(consent);
  }

  /** Best-effort full snapshot after reconcile / bulk mutations. */
  async mirrorAll(): Promise<void> {
    for (const userId of this.engine.users.keys()) {
      await this.mirrorUser(userId);
      await this.mirrorPresence(userId);
    }
    for (const signalId of this.engine.signals.keys()) {
      await this.mirrorSignal(signalId);
    }
    for (const connectionId of this.engine.connections.keys()) {
      await this.mirrorConnection(connectionId);
    }
  }

  get repository(): ProtocolRepository {
    return this.repo;
  }
}
