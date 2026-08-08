export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

/** Structured logger — never log phones, tokens, precise location, selfie URLs. */
export class StructuredLogger {
  constructor(private readonly service: string) {}

  private write(level: LogLevel, msg: string, fields: LogFields = {}): void {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: this.service,
      msg,
      ...this.redact(fields),
    });
    if (level === "error") console.error(line);
    else console.log(line);
  }

  private redact(fields: LogFields): LogFields {
    const out: LogFields = {};
    for (const [k, v] of Object.entries(fields)) {
      const key = k.toLowerCase();
      if (
        key.includes("phone") ||
        key.includes("token") ||
        key.includes("selfie") ||
        key.includes("password") ||
        key === "lat" ||
        key === "lng"
      ) {
        out[k] = "[redacted]";
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  info(msg: string, fields?: LogFields): void {
    this.write("info", msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.write("warn", msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.write("error", msg, fields);
  }
}

export class MetricsRegistry {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  incr(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  observe(name: string, valueMs: number): void {
    const arr = this.histograms.get(name) ?? [];
    arr.push(valueMs);
    this.histograms.set(name, arr);
  }

  snapshot(): {
    counters: Record<string, number>;
    histograms: Record<string, { count: number; p50: number; p95: number }>;
  } {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;
    const histograms: Record<string, { count: number; p50: number; p95: number }> = {};
    for (const [k, arr] of this.histograms) {
      const sorted = [...arr].sort((a, b) => a - b);
      const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] ?? 0;
      histograms[k] = { count: sorted.length, p50: pct(0.5), p95: pct(0.95) };
    }
    return { counters, histograms };
  }
}

export class TraceContext {
  constructor(public readonly traceId: string = randomTraceId()) {}
}

function randomTraceId(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export interface ReadinessReport {
  ready: boolean;
  checks: Record<string, { ok: boolean; detail?: string }>;
  measuredAt: string;
}

export function buildReadiness(checks: Record<string, { ok: boolean; detail?: string }>): ReadinessReport {
  return {
    ready: Object.values(checks).every((c) => c.ok),
    checks,
    measuredAt: new Date().toISOString(),
  };
}
