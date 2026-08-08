import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "apps/api/src/modules/auth/auth.controller.ts",
  "apps/api/src/modules/signals/signals.controller.ts",
  "apps/api/src/modules/radar/radar.controller.ts",
  "apps/api/src/modules/connections/connections.controller.ts",
  "apps/api/src/modules/safety/safety.controller.ts",
  "apps/api/src/modules/privacy/privacy.controller.ts",
  "apps/api/src/modules/destiny/destiny.controller.ts",
  "apps/api/src/modules/internal/internal.controller.ts",
  "apps/api/src/modules/dev/dev.controller.ts",
  "apps/api/src/modules/health/health.controller.ts",
];

for (const f of files) {
  const s = readFileSync(f, "utf8");
  const ctrlMatch = s.match(/\n(@Public\(\)\s*\n)?@Controller/);
  const injIdx = s.indexOf("\n@Injectable()");
  if (!ctrlMatch || injIdx < 0) {
    console.log("skip", f);
    continue;
  }
  const ctrlIdx = ctrlMatch.index;
  if (ctrlIdx > injIdx) {
    console.log("ok", f);
    continue;
  }
  const header = s.slice(0, ctrlIdx);
  const controllerPart = s.slice(ctrlIdx, injIdx).trim();
  const servicePart = s.slice(injIdx).trim();
  writeFileSync(f, `${header}\n${servicePart}\n\n${controllerPart}\n`);
  console.log("reordered", f);
}
