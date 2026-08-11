import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { DomainError } from "@wingman/domain";
import { ERROR_CATALOG } from "@wingman/contracts";
import { AuthError } from "@wingman/auth";
import { AntiAbuseError, httpStatusForAbuse } from "@wingman/anti-abuse";
import { MeasurementLearningForbiddenError } from "@wingman/measurement";
import type { Response } from "express";
import { ZodError } from "zod";

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const status = (ERROR_CATALOG as Record<string, number>)[exception.code] ?? 400;
      res.status(status).json({
        error: { code: exception.code, message: exception.message, details: exception.details },
      });
      return;
    }

    if (exception instanceof MeasurementLearningForbiddenError) {
      res.status(503).json({
        error: { code: exception.code, message: exception.message },
      });
      return;
    }

    if (exception instanceof AntiAbuseError) {
      const status = httpStatusForAbuse(exception.code);
      // Public body: action + expiry only — strip internal reason lists if present
      const details = exception.details
        ? {
            action: exception.details.action,
            expiresAt: exception.details.expiresAt,
            policyVersion: exception.details.policyVersion,
          }
        : undefined;
      res.status(status).json({
        error: { code: exception.code, message: exception.message, details },
      });
      return;
    }

    if (exception instanceof AuthError) {
      const status =
        exception.code === "OTP_RATE_LIMITED"
          ? 429
          : exception.code.startsWith("SESSION") || exception.code === "DEVICE_MISMATCH"
            ? 401
            : 400;
      res.status(status).json({ error: { code: exception.code, message: exception.message } });
      return;
    }

    if (exception instanceof ZodError) {
      res.status(400).json({
        error: { code: "VALIDATION", message: "Invalid request", details: exception.flatten() },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(typeof body === "string" ? { error: { code: "HTTP", message: body } } : body);
      return;
    }

    console.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL", message: "Internal error" },
    });
  }
}
