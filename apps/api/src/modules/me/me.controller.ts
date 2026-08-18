import { Body, Controller, Get, Inject, Injectable, Post } from "@nestjs/common";
import { ProfileUpdateSchema } from "@wingman/contracts";
import type { WingmanEngine } from "@wingman/domain";
import type { ProtocolPersistenceMirror } from "@wingman/persistence";
import { z } from "zod";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { WINGMAN_ENGINE } from "../../engine/engine.tokens.js";
import { PROTOCOL_MIRROR } from "../infra/infra.tokens.js";

type ProfileBody = z.infer<typeof ProfileUpdateSchema>;

function grantedConsentPurposes(
  consents: Array<{ userId: string; purpose: string; action: string; occurredAt: Date }>,
  userId: string,
): string[] {
  const latest = new Map<string, { action: string; at: number }>();
  for (const c of consents) {
    if (c.userId !== userId) continue;
    const at = c.occurredAt instanceof Date ? c.occurredAt.getTime() : 0;
    const prev = latest.get(c.purpose);
    if (!prev || at >= prev.at) latest.set(c.purpose, { action: c.action, at });
  }
  return [...latest.entries()].filter(([, v]) => v.action === "GRANTED").map(([p]) => p);
}

@Injectable()
export class MeService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
  ) {}

  get(userId: string) {
    const user = this.engine.users.get(userId);
    const granted = grantedConsentPurposes(this.engine.consents, userId);
    if (!user) {
      return { userId, profile: null, consents: granted };
    }
    return { userId, profile: user.profile, consents: granted };
  }

  async updateProfile(userId: string, body: ProfileBody) {
    const user = this.engine.updateProfile(userId, {
      gender: body.gender,
      interestedIn: body.interestedIn,
      firstName: body.firstName,
      birthDate: body.birthDate,
      heightCm: body.heightCm,
      dailyBio: body.dailyBio,
      interests: body.interests,
      mood: body.mood,
      intention: body.intention,
      locale: body.locale,
    });
    await this.mirror.mirrorUser(userId);
    return { userId, profile: user.profile };
  }
}

@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() userId: string) {
    return this.me.get(userId);
  }

  @Post("profile")
  async profile(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(ProfileUpdateSchema)) body: ProfileBody,
  ) {
    return this.me.updateProfile(userId, body);
  }
}
