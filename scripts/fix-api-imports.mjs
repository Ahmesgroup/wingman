import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const apiSrc = join(process.cwd(), "apps/api/src");
for (const file of walk(apiSrc)) {
  let s = readFileSync(file, "utf8");
  const orig = s;
  s = s.replace(/from ["'](\.[^"']+)["']/g, (m, spec) => {
    if (spec.endsWith(".js") || spec.endsWith(".json")) return m;
    const q = m.includes("'") ? "'" : '"';
    return `from ${q}${spec}.js${q}`;
  });
  if (s !== orig) {
    writeFileSync(file, s);
    console.log("fixed", file);
  }
}
