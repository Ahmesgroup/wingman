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
assert(src.includes('Wingman makes it easy to say hello to someone already near you.'), 'locked splash supporting line missing');
assert(!src.includes('From presence to hello'), 'superseded positioning remains in public onboarding');
assert(src.includes('await api.report(body);'), 'report API wire missing');
assert(src.includes('await api.block({ userId: state.peerId });'), 'block API wire missing');
assert(src.includes('mm-report-btn'), 'Mission Meet report entry missing');
assert(src.includes("if (p.senderId) state.peerId = p.senderId;"), 'recipient peerId from signal.received missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('data-report-category="HARASSMENT"'), 'report categories must post to API');
assert(!fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('Chez Léon'), 'demo chat must not ship on public Mission');
assert(fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8').includes("request('POST', '/safety/report'"), 'api.report missing');

// Unguarded peer selfie / outcome must not exist as standalone awaits
const lines = src.split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.includes('userId: state.peerId')) continue;
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
  // Safety bodies name the target; they are not x-user-id impersonation.
  if (trimmed.includes('api.block') || trimmed.includes('category')) continue;
  // Must be nested under allowPeerSim somewhere nearby — require the line itself is inside a gated call
  assert(
    /allowPeerSim/.test(src.slice(Math.max(0, src.indexOf(trimmed) - 400), src.indexOf(trimmed) + trimmed.length)),
    'peer userId opt without allowPeerSim near: ' + trimmed.slice(0, 80),
  );
}

assert(fs.existsSync(path.join(__dirname, 'realtime.js')), 'realtime.js missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('profile-next-btn'), 'html profile CTA');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('consent-cta-btn'), 'html consent CTA');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('consent-back-btn'), 'consent back missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('set-consent-btn'), 'Me consent entry missing');
assert(!fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('data-go="v-consent"'), 'profile still data-go');
assert(fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8').includes("/radar/heartbeat"), 'radarHeartbeat client missing');
assert(src.includes('startPresenceHeartbeat'), 'presence heartbeat loop missing');
assert(src.includes('requestViewerLocation'), 'browser geolocation wire missing');
assert(!/\$\('#radar-toggle'\)[\s\S]*?49\.6116/.test(src), 'Go active still hardcodes Luxembourg');

console.log('protocol-client.regression.test.mjs: ok');
