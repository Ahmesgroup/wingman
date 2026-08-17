import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const p of [
  'assets/screenshots',
  'assets/diagrams',
  'assets/images',
  'src',
  'scripts',
  'qa',
]) {
  mkdirSync(join(root, p), { recursive: true });
}
console.log('ok', root);
