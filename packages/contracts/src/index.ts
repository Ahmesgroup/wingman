import { z } from "zod";

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export const ActivateRadarSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  visibility: z.enum(["ACTIVE", "INVISIBLE", "BUSY", "UNAVAILABLE"]).default("ACTIVE"),
});

export const HeartbeatSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const CreateSignalSchema = z.object({
  receiverId: z.string().min(1),
  source: z.enum(["RADAR", "DESTINY", "REMATCH"]).default("RADAR"),
});

export const SelfieSchema = z.object({
  mediaId: z.string().min(1),
});

export const OutcomeSchema = z.object({
  outcome: z.enum(["YES", "NO"]),
});

export const MissionMessageSchema = z.object({
  text: z.string().min(1).max(500),
});

export const BlockSchema = z.object({
  userId: z.string().min(1),
});

export const ReportSchema = z.object({
  userId: z.string().min(1),
  category: z.string().min(1),
  connectionId: z.string().optional(),
});

export const ConsentSchema = z.object({
  purpose: z.string().min(1),
  policyVersion: z.string().min(1),
});

export const ERROR_CATALOG = {
  FORBIDDEN_TRANSITION: 409,
  SIGNAL_QUOTA_EXCEEDED: 429,
  SIGNAL_PAIR_ACTIVE: 409,
  SIGNAL_BLOCKED: 403,
  BLOCKED_PAIR: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  DESTINY_DISABLED: 503,
  VALIDATION_REQUIRED: 422,
  USER_LOCKED: 409,
  CONFLICT: 409,
} as const;

export type ErrorCatalogCode = keyof typeof ERROR_CATALOG;
