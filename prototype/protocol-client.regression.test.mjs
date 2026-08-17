/**
 * Regression: public product path must never impersonate the peer via x-user-id opts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(src.includes('allowPeerSim'), 'allowPeerSim guard missing');
assert(src.includes('saveProfile'), 'profile save wire missing');
assert(src.includes('WingmanRealtime'), 'realtime client missing');
assert(src.includes('uploaded.mediaId'), 'opaque media id missing');
assert(src.includes('listMessages'), 'mission message restore missing');
assert(src.includes('profile-next-btn'), 'profile CTA wire missing');
assert(src.includes('consent-cta-btn'), 'consent CTA wire missing');
assert(src.includes('Make the first acquaintance easy'), 'locked primary tagline missing from public onboarding');
assert(src.includes('Love is in the air.'), 'secondary emotional slogan missing from public onboarding');
assert(src.includes('first real-world interaction'), 'supporting description missing from public onboarding');
assert(!src.includes('From presence to hello'), 'superseded positioning remains in public onboarding');
assert(src.includes('await api.openSignal(state.signalId);'), 'openSignal must be self');
assert(src.includes('await api.acceptSignal(state.signalId);'), 'acceptSignal must be self');

// Unguarded peer selfie / outcome must not exist as standalone awaits
const lines = src.split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.includes('userId: state.peerId')) continue;
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
  // Must be nested under allowPeerSim somewhere nearby — require the line itself is inside a gated call
  assert(
    /allowPeerSim/.test(src.slice(Math.max(0, src.indexOf(trimmed) - 400), src.indexOf(trimmed) + trimmed.length)),
    'peer userId opt without allowPeerSim near: ' + trimmed.slice(0, 80),
  );
}

assert(fs.existsSync(path.join(__dirname, 'realtime.js')), 'realtime.js missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('profile-next-btn'), 'html profile CTA');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('consent-cta-btn'), 'html consent CTA');
assert(!fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('data-go="v-consent"'), 'profile still data-go');

console.log('protocol-client.regression.test.mjs: ok');
