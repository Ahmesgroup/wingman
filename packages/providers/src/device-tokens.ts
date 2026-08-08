export type PushPlatform = "ios" | "android" | "web";

export interface DevicePushTarget {
  userId: string;
  deviceId: string;
  platform: PushPlatform;
  pushToken: string;
  active: boolean;
  updatedAt: Date;
}

export interface DeviceTokenStore {
  upsert(target: Omit<DevicePushTarget, "active" | "updatedAt"> & { active?: boolean }): Promise<DevicePushTarget>;
  listActiveForUser(userId: string): Promise<DevicePushTarget[]>;
  deactivateToken(pushToken: string, reason: string): Promise<void>;
  getByToken(pushToken: string): Promise<DevicePushTarget | null>;
}

/** In-process registry — swap for Prisma later without changing push ports. */
export class MemoryDeviceTokenStore implements DeviceTokenStore {
  private byToken = new Map<string, DevicePushTarget>();

  async upsert(input: Omit<DevicePushTarget, "active" | "updatedAt"> & { active?: boolean }): Promise<DevicePushTarget> {
    const next: DevicePushTarget = {
      ...input,
      active: input.active ?? true,
      updatedAt: new Date(),
    };
    this.byToken.set(input.pushToken, next);
    // one active token per deviceId
    for (const [token, row] of this.byToken) {
      if (token !== input.pushToken && row.userId === input.userId && row.deviceId === input.deviceId) {
        this.byToken.set(token, { ...row, active: false, updatedAt: new Date() });
      }
    }
    return next;
  }

  async listActiveForUser(userId: string): Promise<DevicePushTarget[]> {
    return [...this.byToken.values()].filter((t) => t.userId === userId && t.active);
  }

  async deactivateToken(pushToken: string, _reason: string): Promise<void> {
    const row = this.byToken.get(pushToken);
    if (row) this.byToken.set(pushToken, { ...row, active: false, updatedAt: new Date() });
  }

  async getByToken(pushToken: string): Promise<DevicePushTarget | null> {
    return this.byToken.get(pushToken) ?? null;
  }
}
