import { Body, Controller, Inject, Injectable, Post } from "@nestjs/common";
import { z } from "zod";
import type { DeviceTokenStore } from "@wingman/providers";
import { CurrentUser } from "../../common/auth.js";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { DEVICE_TOKEN_STORE } from "../infra/infra.tokens.js";

const RegisterPushSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
  pushToken: z.string().min(8),
});

@Injectable()
export class DevicesService {
  constructor(@Inject(DEVICE_TOKEN_STORE) private readonly tokens: DeviceTokenStore) {}

  register(
    userId: string,
    body: { deviceId: string; platform: "ios" | "android" | "web"; pushToken: string },
  ) {
    return this.tokens.upsert({
      userId,
      deviceId: body.deviceId,
      platform: body.platform,
      pushToken: body.pushToken,
    });
  }
}

@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post("push-token")
  async register(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(RegisterPushSchema))
    body: { deviceId: string; platform: "ios" | "android" | "web"; pushToken: string },
  ) {
    const row = await this.devices.register(userId, body);
    return {
      ok: true,
      deviceId: row.deviceId,
      platform: row.platform,
      active: row.active,
    };
  }
}
