import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthService } from "@wingman/auth";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

export const CURRENT_USER = "wingmanUserId";

@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request & { [CURRENT_USER]?: string }>();
    const userId = req.header("x-user-id");
    if (!userId) throw new UnauthorizedException({ error: { code: "UNAUTHORIZED", message: "x-user-id required" } });
    req[CURRENT_USER] = userId;
    return true;
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request & { [CURRENT_USER]?: string }>();
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      if (process.env.AUTH_ALLOW_DEV === "true") {
        const userId = req.header("x-user-id");
        if (userId) {
          req[CURRENT_USER] = userId;
          return true;
        }
      }
      throw new UnauthorizedException({ error: { code: "UNAUTHORIZED", message: "Bearer token required" } });
    }
    const token = header.slice("Bearer ".length);
    const deviceId = req.header("x-device-id") ?? undefined;
    try {
      const { userId } = await this.auth.authenticate(token, deviceId);
      req[CURRENT_USER] = userId;
      return true;
    } catch (e) {
      throw new UnauthorizedException({
        error: {
          code: (e as { code?: string }).code ?? "UNAUTHORIZED",
          message: e instanceof Error ? e.message : "Unauthorized",
        },
      });
    }
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request & { [CURRENT_USER]?: string }>();
  const userId = req[CURRENT_USER];
  if (!userId) throw new UnauthorizedException({ error: { code: "UNAUTHORIZED", message: "No user" } });
  return userId;
});

export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.header("idempotency-key") ?? undefined;
});
