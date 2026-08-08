import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { MetricsRegistry, StructuredLogger } from "@wingman/observability";

export const METRICS = Symbol("METRICS");
export const LOGGER = Symbol("LOGGER");

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsRegistry,
    private readonly logger: StructuredLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string; url: string }>();
    const start = Date.now();
    this.metrics.incr("http_requests");
    return next.handle().pipe(
      tap({
        next: () => {
          this.metrics.observe("http_ms", Date.now() - start);
          this.logger.info("request", { method: req.method, path: req.url, ms: Date.now() - start });
        },
        error: () => {
          this.metrics.incr("http_errors");
          this.metrics.observe("http_ms", Date.now() - start);
        },
      }),
    );
  }
}
