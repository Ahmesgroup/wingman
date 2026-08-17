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

@Injectable()
export class MeService {
  constructor(
    @Inject(WINGMAN_ENGINE) private readonly engine: WingmanEngine,
    @Inject(PROTOCOL_MIRROR) private readonly mirror: ProtocolPersistenceMirror,
  ) {}

  get(userId: string) {
    const user = this.engine.users.get(userId);
    if (!user) {
      return { userId, profile: null };
    }
    return { userId, profile: user.profile };
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
