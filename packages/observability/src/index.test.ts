import { describe, expect, it } from "vitest";
import { MetricsRegistry, StructuredLogger, buildReadiness } from "./index.js";

describe("observability", () => {
  it("redacts sensitive fields and aggregates metrics", () => {
    const logger = new StructuredLogger("test");
    const spy = vi_spy();
    const orig = console.log;
    console.log = spy.fn;
    logger.info("auth", { phone: "+336", token: "abc", userId: "u1" });
    console.log = orig;
    expect(spy.lines[0]).toContain("[redacted]");
    expect(spy.lines[0]).toContain("u1");
    expect(spy.lines[0]).not.toContain("+336");

    const metrics = new MetricsRegistry();
    metrics.incr("http_requests");
    metrics.observe("http_ms", 10);
    metrics.observe("http_ms", 20);
    const snap = metrics.snapshot();
    expect(snap.counters.http_requests).toBe(1);
    expect(snap.histograms.http_ms.count).toBe(2);

    expect(buildReadiness({ domain: { ok: true }, redis: { ok: false, detail: "down" } }).ready).toBe(false);
  });
});

function vi_spy() {
  const lines: string[] = [];
  return {
    lines,
    fn: (s: string) => {
      lines.push(s);
    },
  };
}
