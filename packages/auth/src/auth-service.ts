import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  MemoryAuthPersistence,
  type AuthPersistence,
  type Session,
} from "./persistence.js";

export type { Session } from "./persistence.js";

/** Access token lifetime — 1 hour. Reopen within this window needs no refresh. */
export const AUTH_ACCESS_TTL_MS = 60 * 60 * 1000;
/** Refresh token lifetime — 30 days. Returning users restore without OTP while this is valid. */
export const AUTH_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(
    public readonly code:
      | "OTP_INVALID"
      | "OTP_EXPIRED"
      | "OTP_RATE_LIMITED"
      | "OTP_PROVIDER_UNAVAILABLE"
      | "PHONE_INVALID"
      | "PHONE_NOT_ALLOWED"
      | "SESSION_INVALID"
      | "SESSION_REVOKED"
      | "DEVICE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface OtpChallenge {
  id: string;
  phoneLookup: string;
  codeHash: string;
  /** When true, code is owned by an external verifier (e.g. Twilio Verify). */
  external: boolean;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface Device {
  id: string;
  userId: string;
  pushToken?: string;
  platform?: string;
}

export type IssuedSession = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  accessTtlMs: number;
  refreshTtlMs: number;
};

export type AuthServiceOpts = {
  otpTtlMs: number;
  otpMaxPerPhoneWindow: number;
  otpWindowMs: number;
  sessionTtlMs: number;
  refreshTtlMs: number;
  persistence?: AuthPersistence;
};

const DEFAULT_OPTS: Omit<AuthServiceOpts, "persistence"> = {
  otpTtlMs: 5 * 60 * 1000,
  otpMaxPerPhoneWindow: 5,
  otpWindowMs: 15 * 60 * 1000,
  sessionTtlMs: AUTH_ACCESS_TTL_MS,
  refreshTtlMs: AUTH_REFRESH_TTL_MS,
};

function hash(value: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export class AuthService {
  private otps = new Map<string, OtpChallenge>();
  private otpByPhone = new Map<string, string>();
  private devices = new Map<string, Device>();
  private otpRequests: Array<{ phoneLookup: string; at: number }> = [];
  private readonly persist: AuthPersistence;
  private readonly opts: Omit<AuthServiceOpts, "persistence">;

  constructor(
    private readonly pepper: string,
    private readonly now: () => Date = () => new Date(),
    opts: Partial<AuthServiceOpts> = {},
  ) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.persist = opts.persistence ?? new MemoryAuthPersistence();
  }

  get accessTtlMs(): number {
    return this.opts.sessionTtlMs;
  }
  get refreshTtlMs(): number {
    return this.opts.refreshTtlMs;
  }

  phoneLookup(e164: string): string {
    return hash(e164, this.pepper);
  }

  async ensureUser(phoneE164: string, userId?: string): Promise<string> {
    const lookup = this.phoneLookup(phoneE164);
    const existing = await this.persist.getUserId(lookup);
    if (existing) return existing;
    const id = userId ?? newId("usr");
    await this.persist.putUserId(lookup, id);
    return id;
  }

  requestOtp(
    phoneE164: string,
    options?: { deliveryCode?: string; external?: boolean },
  ): { challengeId: string; deliveryCode: string; debugCode?: string } {
    const lookup = this.phoneLookup(phoneE164);
    const t = this.now().getTime();
    this.otpRequests = this.otpRequests.filter((r) => t - r.at < this.opts.otpWindowMs);
    const count = this.otpRequests.filter((r) => r.phoneLookup === lookup).length;
    if (count >= this.opts.otpMaxPerPhoneWindow) {
      throw new AuthError("OTP_RATE_LIMITED", "Too many OTP requests");
    }
    this.otpRequests.push({ phoneLookup: lookup, at: t });

    const external = options?.external === true;
    const code = external
      ? ""
      : options?.deliveryCode && /^\d{6}$/.test(options.deliveryCode)
        ? options.deliveryCode
        : String(Math.floor(100000 + Math.random() * 900000));
    const challenge: OtpChallenge = {
      id: newId("otp"),
      phoneLookup: lookup,
      codeHash: external ? "" : hash(code, this.pepper),
      external,
      attempts: 0,
      maxAttempts: 5,
      createdAt: this.now(),
      expiresAt: new Date(t + this.opts.otpTtlMs),
    };
    this.otps.set(challenge.id, challenge);
    this.otpByPhone.set(lookup, challenge.id);
    return {
      challengeId: challenge.id,
      deliveryCode: code,
      debugCode:
        !external && process.env.NODE_ENV === "test" && process.env.AUTH_DEBUG_OTP === "true"
          ? code
          : undefined,
    };
  }

  async verifyOtp(phoneE164: string, code: string, deviceId: string): Promise<IssuedSession> {
    const challenge = this.requireActiveChallenge(phoneE164);
    if (challenge.external) {
      throw new AuthError("OTP_INVALID", "External OTP must be completed via verifier");
    }
    challenge.attempts += 1;
    if (challenge.attempts > challenge.maxAttempts) {
      throw new AuthError("OTP_RATE_LIMITED", "Too many OTP attempts");
    }
    const expected = new Uint8Array(Buffer.from(challenge.codeHash));
    const actual = new Uint8Array(Buffer.from(hash(code, this.pepper)));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new AuthError("OTP_INVALID", "Invalid OTP code");
    }
    return this.consumeChallenge(phoneE164, challenge, deviceId);
  }

  /**
   * After an external verifier (Twilio Verify) approved the code.
   * Still enforces local challenge presence + expiry; does not trust client code.
   */
  async completeExternalOtp(phoneE164: string, deviceId: string): Promise<IssuedSession> {
    const challenge = this.requireActiveChallenge(phoneE164);
    if (!challenge.external) {
      throw new AuthError("OTP_INVALID", "Challenge is not external");
    }
    return this.consumeChallenge(phoneE164, challenge, deviceId);
  }

  private requireActiveChallenge(phoneE164: string): OtpChallenge {
    const lookup = this.phoneLookup(phoneE164);
    const challengeId = this.otpByPhone.get(lookup);
    if (!challengeId) throw new AuthError("OTP_INVALID", "No OTP challenge");
    const challenge = this.otps.get(challengeId);
    if (!challenge || challenge.consumedAt) throw new AuthError("OTP_INVALID", "Invalid OTP");
    if (this.now().getTime() >= challenge.expiresAt.getTime()) {
      throw new AuthError("OTP_EXPIRED", "OTP expired");
    }
    return challenge;
  }

  private async consumeChallenge(
    phoneE164: string,
    challenge: OtpChallenge,
    deviceId: string,
  ): Promise<IssuedSession> {
    challenge.consumedAt = this.now();
    const userId = await this.ensureUser(phoneE164);
    this.devices.set(deviceId, { id: deviceId, userId });
    return this.issueSession(userId, deviceId);
  }

  async issueSession(userId: string, deviceId: string): Promise<IssuedSession> {
    const accessToken = randomBytes(24).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    const now = this.now();
    const session: Session = {
      id: newId("ses"),
      userId,
      tokenHash: hash(accessToken, this.pepper),
      refreshHash: hash(refreshToken, this.pepper),
      deviceId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.opts.sessionTtlMs),
      refreshExpiresAt: new Date(now.getTime() + this.opts.refreshTtlMs),
    };
    await this.persist.putSession(
      session,
      Math.ceil(this.opts.sessionTtlMs / 1000),
      Math.ceil(this.opts.refreshTtlMs / 1000),
    );
    return {
      userId,
      accessToken,
      refreshToken,
      expiresAt: session.expiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      accessTtlMs: this.opts.sessionTtlMs,
      refreshTtlMs: this.opts.refreshTtlMs,
    };
  }

  async authenticate(accessToken: string, deviceId?: string): Promise<{ userId: string; sessionId: string }> {
    const tokenHash = hash(accessToken, this.pepper);
    const session = await this.persist.getByAccessHash(tokenHash);
    if (!session) throw new AuthError("SESSION_INVALID", "Unknown session");
    if (session.revokedAt) throw new AuthError("SESSION_REVOKED", "Session revoked");
    if (this.now().getTime() >= session.expiresAt.getTime()) {
      throw new AuthError("SESSION_INVALID", "Session expired");
    }
    if (deviceId && session.deviceId !== deviceId) {
      throw new AuthError("DEVICE_MISMATCH", "Device binding mismatch");
    }
    return { userId: session.userId, sessionId: session.id };
  }

  async refresh(refreshToken: string, deviceId: string): Promise<IssuedSession> {
    const refreshHash = hash(refreshToken, this.pepper);
    const session = await this.persist.getByRefreshHash(refreshHash);
    if (!session) throw new AuthError("SESSION_INVALID", "Invalid refresh");
    if (session.revokedAt) throw new AuthError("SESSION_REVOKED", "Session revoked");
    if (this.now().getTime() >= session.refreshExpiresAt.getTime()) {
      throw new AuthError("SESSION_INVALID", "Refresh expired");
    }
    if (session.deviceId !== deviceId) {
      throw new AuthError("DEVICE_MISMATCH", "Device binding mismatch");
    }
    session.revokedAt = this.now();
    await this.persist.dropSession(session);
    return this.issueSession(session.userId, deviceId);
  }

  async revoke(accessToken: string): Promise<void> {
    const tokenHash = hash(accessToken, this.pepper);
    const session = await this.persist.getByAccessHash(tokenHash);
    if (!session) return;
    session.revokedAt = this.now();
    await this.persist.dropSession(session);
  }

  /** Replay protection: revoked token cannot authenticate */
  async isReplaySafe(accessToken: string): Promise<boolean> {
    try {
      await this.authenticate(accessToken);
      return true;
    } catch {
      return false;
    }
  }
}
