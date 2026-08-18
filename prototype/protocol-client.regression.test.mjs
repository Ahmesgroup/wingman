/**
 * Regression: public product path must never impersonate the peer via x-user-id opts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(src.includes('allowPeerSim'), 'allowPeerSim guard missing');
assert(src.includes('saveProfile'), 'profile save wire missing');
assert(src.includes('WingmanRealtime'), 'realtime client missing');
assert(src.includes('getUserMedia'), 'camera capture missing');
assert(src.includes('t_cam_denied'), 'camera denied copy missing');
assert(src.includes('Send a live selfie'), 'EN live selfie CTA missing');
assert(src.includes('Let them know'), 'EN selfie body missing');
assert(src.includes('Visible only for this connection.'), 'EN selfie privacy missing');
assert(src.includes('uploaded.capturedAt'), 'server capture timestamp wire missing');
assert(src.includes('isSlowSelfieNet'), 'slow-network selfie honesty missing');
assert(!html.includes('type="file"'), 'gallery file input must not exist on public selfie');
assert(apiSrc.includes('TIMEOUT'), 'upload abort/timeout missing');
assert(src.includes('listMessages'), 'mission message restore missing');
assert(src.includes('profile-next-btn'), 'profile CTA wire missing');
assert(src.includes('consent-cta-btn'), 'consent CTA wire missing');
assert(src.includes('Make the first acquaintance easy'), 'locked primary tagline missing from public onboarding');
assert(src.includes('Love is in the air.'), 'secondary emotional slogan missing from public onboarding');
assert(src.includes('Wingman makes it easy to say hello to someone already near you.'), 'locked splash supporting line missing');
assert(!src.includes('From presence to hello'), 'superseded positioning remains in public onboarding');
assert(src.includes('await api.report(body);'), 'report API wire missing');
assert(src.includes('await api.block({ userId: targetId });'), 'block API wire missing');
assert(src.includes('mm-report-btn'), 'Mission Meet report entry missing');
assert(src.includes('sheet-report-btn'), 'Radar sheet report entry missing');
assert(src.includes('sig-report-btn'), 'Incoming Signal report entry missing');
assert(src.includes('selfie-report-btn'), 'Selfie report entry missing');
assert(src.includes('ticket-report-btn'), 'Mutual/ticket report entry missing');
assert(src.includes('set-safety-btn'), 'Me Safety report entry missing');
assert(src.includes('discover-report'), 'Discover report entry missing');
assert(src.includes('openReportFor'), 'shared two-tap report helper missing');
assert(src.includes("if (p.senderId) state.peerId = p.senderId;"), 'recipient peerId from signal.received missing');
assert(src.includes('scheduleRadarRefresh'), 'debounced radar.changed refresh missing');
assert(src.includes("feedback('signal', t('t_signal_received'))"), 'incoming Signal toast missing');
assert(src.includes("announce(t('t_signal_received'))"), 'incoming Signal a11y announce missing');
assert(src.includes("env.type === 'radar.changed'"), 'radar.changed handler missing');
assert(src.includes('scheduleRadarRefresh()'), 'block/radar realtime refresh missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('id="set-safety-btn"'), 'Me Safety button missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('data-i18n="set_safety_d"'), 'Me Safety human copy missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('id="sheet-report-btn"'), 'Radar sheet report missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('id="mm-report-btn"'), 'Mission Meet report missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('id="sig-report-btn"'), 'Incoming Signal report missing');
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
assert(src.includes('restoreForeground'), 'foreground restore missing');
assert(src.includes('ensureRealtimeReconnect'), 'WS reconnect helper missing');
assert(src.includes('WingmanPresenceReconnect'), 'reconnect policy missing');
assert(src.includes('isHardAuthFailure'), 'auth-failure distinction missing');
assert(fs.readFileSync(path.join(__dirname, 'realtime.js'), 'utf8').includes('reconnect:'), 'realtime.reconnect missing');
assert(fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8').includes('registerPushToken'), 'push token client missing');
assert(fs.readFileSync(path.join(__dirname, 'living-map.js'), 'utf8').includes("radar') === 'canvas'"), 'canvas Radar rollback query missing');
assert(src.includes('lm_count_zero'), 'living map count i18n missing');
assert(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('id="lm-count"'), 'living map count chrome missing');
assert(!fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').includes('0 opportunities nearby'), 'raw English leftover in hidden Living Map');
assert(src.includes('requestViewerLocation'), 'browser geolocation wire missing');
assert(!/\$\('#radar-toggle'\)[\s\S]*?49\.6116/.test(src), 'Go active still hardcodes Luxembourg');
assert(src.includes('rememberExpires'), 'ticket/cooldown must bind server expiresAt');
assert(src.includes('remainingMs'), 'client reads GET remainingMs');
assert(src.includes('t_outcome_saved'), 'own-outcome waiting copy missing');
assert(src.includes('showBlockedChat'), 'human anti-contact bubble missing');
assert(src.includes('[filtered]'), 'client must detect filtered engine marker');
assert(src.includes('ticket_body_free'), 'FREE ticket copy missing');
assert(src.includes('ticket_body_plus'), 'Plus ticket copy missing');
assert(src.includes('pulse_few'), 'Pulse must not dump peopleActive codes');
assert(src.includes("Public tabs: Radar / Discover / Pulse / Me"), 'nav hygiene comment missing');
assert(!/navItems\(\)[\s\S]*?\['v-signal', 'signal'/.test(src), 'Signal must not be a permanent tab');
assert(html.includes('id="outcome-wait"'), 'outcome waiting copy missing in HTML');
assert(html.includes('id="pulse-legacy"') && html.includes('qa-only'), 'fake Pulse legacy must stay qa-only');
assert(html.includes('id="destiny-card"') && html.includes('hidden'), 'Destiny card must stay hidden by default');

console.log('protocol-client.regression.test.mjs: ok');
