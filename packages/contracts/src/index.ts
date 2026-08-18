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

export const LivingMapFilterQuerySchema = z.object({
  proximity: z.string().max(80).optional(),
  presence: z.string().max(80).optional(),
  intention: z.string().max(80).optional(),
  interests: z.string().max(200).optional(),
  nearRadiusM: z.string().optional(),
  aroundRadiusM: z.string().optional(),
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

export const ProfileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(40).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  gender: z.enum(["MALE", "FEMALE", "NON_BINARY"]),
  interestedIn: z
    .array(z.enum(["MEN", "WOMEN", "NON_BINARY_PEOPLE"]))
    .min(1)
    .max(3),
  heightCm: z.number().int().min(120).max(230).optional(),
  interests: z.array(z.string().min(1).max(40)).max(5).optional(),
  dailyBio: z.string().max(150).optional(),
  mood: z.enum(["SUPER_READY", "OPEN", "UNSURE"]).optional(),
  intention: z.enum(["AVAILABLE_NOW", "JUST_EXPLORING"]).optional(),
  locale: z.enum(["en", "fr"]).optional(),
});

export const ERROR_CATALOG = {
  FORBIDDEN_TRANSITION: 409,
  SIGNAL_QUOTA_EXCEEDED: 429,
  SIGNAL_PAIR_ACTIVE: 409,
  SIGNAL_BLOCKED: 403,
  BLOCKED_PAIR: 403,
  SIGNAL_NOT_FOUND: 404,
  CONNECTION_NOT_FOUND: 404,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  DESTINY_DISABLED: 503,
  VALIDATION_REQUIRED: 422,
  USER_LOCKED: 409,
  CONFLICT: 409,
} as const;

export type ErrorCatalogCode = keyof typeof ERROR_CATALOG;
