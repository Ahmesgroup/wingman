import type { Clock } from "../clock.js";
import { DomainError } from "../errors.js";

export interface BlockRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  reportedId: string;
  category: string;
  createdAt: Date;
  connectionId?: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  purpose: string;
  action: "GRANTED" | "WITHDRAWN";
  policyVersion: string;
  occurredAt: Date;
}

export function assertNotBlocked(blockerSet: Set<string>, userA: string, userB: string): void {
  const key1 = `${userA}->${userB}`;
  const key2 = `${userB}->${userA}`;
  if (blockerSet.has(key1) || blockerSet.has(key2)) {
    throw new DomainError("BLOCKED_PAIR", "Users are blocked");
  }
}

export function isBlockedEitherWay(blocks: BlockRecord[], userA: string, userB: string): boolean {
  return blocks.some(
    (b) =>
      (b.blockerId === userA && b.blockedId === userB) ||
      (b.blockerId === userB && b.blockedId === userA),
  );
}

export function createBlock(
  id: string,
  blockerId: string,
  blockedId: string,
  clock: Clock,
): BlockRecord {
  if (blockerId === blockedId) {
    throw new DomainError("CONFLICT", "Cannot block yourself");
  }
  return { id, blockerId, blockedId, createdAt: clock.now() };
}

export function createReport(
  id: string,
  reporterId: string,
  reportedId: string,
  category: string,
  clock: Clock,
  connectionId?: string,
): ReportRecord {
  if (reporterId === reportedId) {
    throw new DomainError("CONFLICT", "Cannot report yourself");
  }
  return {
    id,
    reporterId,
    reportedId,
    category,
    createdAt: clock.now(),
    connectionId,
  };
}

export function recordConsent(
  id: string,
  userId: string,
  purpose: string,
  action: "GRANTED" | "WITHDRAWN",
  policyVersion: string,
  clock: Clock,
): ConsentRecord {
  return {
    id,
    userId,
    purpose,
    action,
    policyVersion,
    occurredAt: clock.now(),
  };
}

/** Anti-contact: strip phone/url/@handles from mission messages */
export function filterAntiContact(message: string): { text: string; blocked: boolean } {
  const patterns = [
    /\+?\d[\d\s\-().]{7,}\d/g,
    /https?:\/\/\S+/gi,
    /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi,
    /(^|[\s])@[a-zA-Z0-9_]{2,}/g,
    /\b(whatsapp|telegram|snapchat|instagram|ig)\b/gi,
  ];
  let text = message;
  let blocked = false;
  for (const p of patterns) {
    if (p.test(text)) {
      blocked = true;
      text = text.replace(p, "[filtered]");
    }
  }
  return { text, blocked };
}
