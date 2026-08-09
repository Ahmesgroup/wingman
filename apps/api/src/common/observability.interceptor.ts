import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { MetricsRegistry, StructuredLogger } from "@wingman/observability";
import { randomUUID } from "node:crypto";

export const METRICS = Symbol("METRICS");
export const LOGGER = Symbol("LOGGER");

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsRegistry,
    private readonly logger: StructuredLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      url: string;
      headers: Record<string, string | string[] | undefined>;
      [key: string]: unknown;
    }>();
    const res = http.getResponse<{ setHeader: (k: string, v: string) => void }>();
    const header = req.headers["x-request-id"];
    const requestId = (Array.isArray(header) ? header[0] : header)?.trim() || randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    const userId = (req as { wingmanUserId?: string }).wingmanUserId;
    const start = Date.now();
    this.metrics.incr("http_requests");
    return next.handle().pipe(
      tap({
        next: () => {
          this.metrics.observe("http_ms", Date.now() - start);
          this.logger.info("request", {
            requestId,
            method: req.method,
            path: req.url,
            ms: Date.now() - start,
            ...(userId ? { userId } : {}),
          });
        },
        error: () => {
          this.metrics.incr("http_errors");
          this.metrics.observe("http_ms", Date.now() - start);
          this.logger.error("request_error", {
            requestId,
            method: req.method,
            path: req.url,
            ms: Date.now() - start,
            ...(userId ? { userId } : {}),
          });
        },
      }),
    );
  }
}
