import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const hb = require('./presence-heartbeat.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('presence heartbeat scheduler', () => {
  it('interval is under Redis/domain TTL (120s)', () => {
    assert.equal(hb.PRESENCE_TTL_MS, 120000);
    assert.ok(hb.HEARTBEAT_INTERVAL_MS < hb.PRESENCE_TTL_MS);
    assert.ok(hb.HEARTBEAT_INTERVAL_MS <= 45000);
  });

  it('sends only while Go active and the tab is foreground', () => {
    const now = 100000;
    assert.equal(hb.shouldSendHeartbeat({ radarActive: false, visible: true, now, lastSentAt: null }), false);
    assert.equal(hb.shouldSendHeartbeat({ radarActive: true, visible: false, now, lastSentAt: null }), false);
    assert.equal(hb.shouldSendHeartbeat({ radarActive: true, visible: true, now, lastSentAt: null }), true);
    assert.equal(hb.shouldSendHeartbeat({
      radarActive: true, visible: true, now, lastSentAt: now - 10000, intervalMs: 40000,
    }), false);
    assert.equal(hb.shouldSendHeartbeat({
      radarActive: true, visible: true, now, lastSentAt: now - 40000, intervalMs: 40000,
    }), true);
    assert.equal(hb.shouldSendHeartbeat({
      radarActive: true, visible: true, now, lastSentAt: now - 1000, force: true,
    }), true);
  });

  it('client wires POST /radar/heartbeat', () => {
    const api = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.match(api, /radarHeartbeat/);
    assert.match(api, /\/radar\/heartbeat/);
    assert.match(app, /radarHeartbeat/);
    assert.match(app, /visibilitychange/);
    assert.match(app, /startPresenceHeartbeat/);
    assert.match(app, /stopPresenceHeartbeat/);
  });
});
