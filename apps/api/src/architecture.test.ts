import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function walk(dir: string, pred: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
}

describe("S8 architecture: controllers stay thin", () => {
  it("controllers do not call WingmanEngine directly", () => {
    const root = join(__dirname, "modules");
    const controllers = walk(root, (p) => p.endsWith(".controller.ts"));
    expect(controllers.length).toBeGreaterThan(5);
    for (const file of controllers) {
      const src = readFileSync(file, "utf8");
      const controllerBlock = src.split(/export class \w+Controller/)[1]?.split(/export class/)[0] ?? "";
      expect(controllerBlock).not.toMatch(/@Inject\(\s*WINGMAN_ENGINE\s*\)/);
      expect(controllerBlock).not.toMatch(/this\.engine\./);
    }
  });
});

describe("S17 architecture: WS gateway stays transport-only", () => {
  it("gateway files do not import @wingman/domain", () => {
    const root = join(__dirname, "modules", "realtime");
    const gateways = walk(root, (p) => p.endsWith(".gateway.ts"));
    expect(gateways.length).toBeGreaterThanOrEqual(1);
    for (const file of gateways) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/from\s+["']@wingman\/domain["']/);
      expect(src).not.toMatch(/WINGMAN_ENGINE/);
      expect(src).not.toMatch(/WingmanEngine/);
    }
  });
});
