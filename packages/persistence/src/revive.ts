import type {
  BlockRecord,
  ConsentRecord,
  ConnectionRecord,
  ReportRecord,
  SignalRecord,
  UserSeed,
} from "@wingman/domain";

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

export function reviveUser(raw: unknown): UserSeed {
  const u = raw as UserSeed;
  return structuredClone(u);
}

export function reviveSignal(raw: unknown): SignalRecord {
  const s = raw as SignalRecord;
  return {
    ...s,
    createdAt: asDate(s.createdAt),
    expiresAt: asDate(s.expiresAt),
    openedAt: s.openedAt ? asDate(s.openedAt) : undefined,
    acceptedAt: s.acceptedAt ? asDate(s.acceptedAt) : undefined,
    closedAt: s.closedAt ? asDate(s.closedAt) : undefined,
  };
}

export function reviveConnection(raw: unknown): ConnectionRecord {
  const c = raw as ConnectionRecord;
  return {
    ...c,
    startedAt: asDate(c.startedAt),
    expiresAt: asDate(c.expiresAt),
    endedAt: c.endedAt ? asDate(c.endedAt) : undefined,
    purgeAt: c.purgeAt ? asDate(c.purgeAt) : undefined,
    mutuallyValidatedAt: c.mutuallyValidatedAt ? asDate(c.mutuallyValidatedAt) : undefined,
  };
}

export function reviveBlock(raw: unknown): BlockRecord {
  const b = raw as BlockRecord;
  return { ...b, createdAt: asDate(b.createdAt) };
}

export function reviveReport(raw: unknown): ReportRecord {
  const r = raw as ReportRecord;
  return { ...r, createdAt: asDate(r.createdAt) };
}

export function reviveConsent(raw: unknown): ConsentRecord {
  const c = raw as ConsentRecord;
  return { ...c, occurredAt: asDate(c.occurredAt) };
}
