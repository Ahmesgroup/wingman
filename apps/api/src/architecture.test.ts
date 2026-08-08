import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".controller.ts")) out.push(p);
  }
  return out;
}

describe("S8 architecture: controllers stay thin", () => {
  it("controllers do not call WingmanEngine directly", () => {
    const root = join(__dirname, "modules");
    const controllers = walk(root);
    expect(controllers.length).toBeGreaterThan(5);
    for (const file of controllers) {
      const src = readFileSync(file, "utf8");
      const controllerBlock = src.split(/export class \w+Controller/)[1]?.split(/export class/)[0] ?? "";
      expect(controllerBlock).not.toMatch(/@Inject\(\s*WINGMAN_ENGINE\s*\)/);
      expect(controllerBlock).not.toMatch(/this\.engine\./);
    }
  });
});
