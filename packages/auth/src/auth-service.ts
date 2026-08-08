import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class AuthError extends Error {
  constructor(
    public readonly code:
      | "OTP_INVALID"
      | "OTP_EXPIRED"
      | "OTP_RATE_LIMITED"
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
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  refreshHash: string;
  deviceId: string;
  createdAt: Date;
  expiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt?: Date;
}

export interface Device {
  id: string;
  userId: string;
  pushToken?: string;
  platform?: string;
}

function hash(value: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export class AuthService {
  private otps = new Map<string, OtpChallenge>();
  private otpByPhone = new Map<string, string>();
  private sessions = new Map<string, Session>();
  private sessionsByToken = new Map<string, string>();
  private devices = new Map<string, Device>();
  private otpRequests: Array<{ phoneLookup: string; at: number }> = [];
  private usersByPhone = new Map<string, string>();

  constructor(
    private readonly pepper: string,
    private readonly now: () => Date = () => new Date(),
    private readonly opts = {
      otpTtlMs: 5 * 60 * 1000,
      otpMaxPerPhoneWindow: 5,
      otpWindowMs: 15 * 60 * 1000,
      sessionTtlMs: 60 * 60 * 1000,
      refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
    },
  ) {}

  phoneLookup(e164: string): string {
    return hash(e164, this.pepper);
  }

  ensureUser(phoneE164: string, userId?: string): string {
    const lookup = this.phoneLookup(phoneE164);
    const existing = this.usersByPhone.get(lookup);
    if (existing) return existing;
    const id = userId ?? newId("usr");
    this.usersByPhone.set(lookup, id);
    return id;
  }

  requestOtp(phoneE164: string): { challengeId: string; debugCode?: string } {
    const lookup = this.phoneLookup(phoneE164);
    const t = this.now().getTime();
    this.otpRequests = this.otpRequests.filter((r) => t - r.at < this.opts.otpWindowMs);
    const count = this.otpRequests.filter((r) => r.phoneLookup === lookup).length;
    if (count >= this.opts.otpMaxPerPhoneWindow) {
      throw new AuthError("OTP_RATE_LIMITED", "Too many OTP requests");
    }
    this.otpRequests.push({ phoneLookup: lookup, at: t });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const challenge: OtpChallenge = {
      id: newId("otp"),
      phoneLookup: lookup,
      codeHash: hash(code, this.pepper),
      attempts: 0,
      maxAttempts: 5,
      createdAt: this.now(),
      expiresAt: new Date(t + this.opts.otpTtlMs),
    };
    this.otps.set(challenge.id, challenge);
    this.otpByPhone.set(lookup, challenge.id);
    return {
      challengeId: challenge.id,
      debugCode: process.env.AUTH_DEBUG_OTP === "true" ? code : undefined,
    };
  }

  verifyOtp(phoneE164: string, code: string, deviceId: string): {
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  } {
    const lookup = this.phoneLookup(phoneE164);
    const challengeId = this.otpByPhone.get(lookup);
    if (!challengeId) throw new AuthError("OTP_INVALID", "No OTP challenge");
    const challenge = this.otps.get(challengeId);
    if (!challenge || challenge.consumedAt) throw new AuthError("OTP_INVALID", "Invalid OTP");
    if (this.now().getTime() >= challenge.expiresAt.getTime()) {
      throw new AuthError("OTP_EXPIRED", "OTP expired");
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
    challenge.consumedAt = this.now();
    const userId = this.ensureUser(phoneE164);
    this.devices.set(deviceId, { id: deviceId, userId });
    return this.issueSession(userId, deviceId);
  }

  issueSession(userId: string, deviceId: string) {
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
    this.sessions.set(session.id, session);
    this.sessionsByToken.set(session.tokenHash, session.id);
    return {
      userId,
      accessToken,
      refreshToken,
      expiresAt: session.expiresAt,
    };
  }

  authenticate(accessToken: string, deviceId?: string): { userId: string; sessionId: string } {
    const tokenHash = hash(accessToken, this.pepper);
    const sessionId = this.sessionsByToken.get(tokenHash);
    if (!sessionId) throw new AuthError("SESSION_INVALID", "Unknown session");
    const session = this.sessions.get(sessionId);
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

  refresh(refreshToken: string, deviceId: string) {
    const refreshHash = hash(refreshToken, this.pepper);
    const session = [...this.sessions.values()].find((s) => s.refreshHash === refreshHash);
    if (!session) throw new AuthError("SESSION_INVALID", "Invalid refresh");
    if (session.revokedAt) throw new AuthError("SESSION_REVOKED", "Session revoked");
    if (this.now().getTime() >= session.refreshExpiresAt.getTime()) {
      throw new AuthError("SESSION_INVALID", "Refresh expired");
    }
    if (session.deviceId !== deviceId) {
      throw new AuthError("DEVICE_MISMATCH", "Device binding mismatch");
    }
    session.revokedAt = this.now();
    this.sessionsByToken.delete(session.tokenHash);
    return this.issueSession(session.userId, deviceId);
  }

  revoke(accessToken: string): void {
    const tokenHash = hash(accessToken, this.pepper);
    const sessionId = this.sessionsByToken.get(tokenHash);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.revokedAt = this.now();
    this.sessionsByToken.delete(tokenHash);
  }

  /** Replay protection: revoked token cannot authenticate */
  isReplaySafe(accessToken: string): boolean {
    try {
      this.authenticate(accessToken);
      return true;
    } catch {
      return false;
    }
  }
}
