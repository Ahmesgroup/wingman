import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.js'), 'utf8');

function extractDict(lang) {
  const marker = lang + ': {';
  const start = src.indexOf(marker);
  assert.ok(start > 0, 'missing ' + lang + ' dict');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) {
        const body = src.slice(i + 1, j);
        const keys = new Set();
        const re = /([a-zA-Z0-9_]+)\s*:/g;
        let m;
        while ((m = re.exec(body))) keys.add(m[1]);
        return keys;
      }
    }
  }
  throw new Error('unclosed ' + lang);
}

describe('i18n EN/FR parity', () => {
  it('every EN key has a FR key and vice versa', () => {
    const en = extractDict('en');
    const fr = extractDict('fr');
    const missingFr = [...en].filter((k) => !fr.has(k));
    const missingEn = [...fr].filter((k) => !en.has(k));
    assert.deepEqual(missingFr, [], 'missing FR keys');
    assert.deepEqual(missingEn, [], 'missing EN keys');
  });

  it('HTML data-i18n keys exist in EN dict', () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');
    const en = extractDict('en');
    const keys = [...html.matchAll(/data-i18n(?:-ph)?="([^"]+)"/g)].map((m) => m[1]);
    const missing = keys.filter((k) => !en.has(k));
    assert.deepEqual(missing, [], 'HTML keys missing from EN');
  });
});
