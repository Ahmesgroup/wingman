import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const recon = require('./presence-reconnect.js');
const hb = require('./presence-heartbeat.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('S32 visibility reconnect / restore', () => {
  it('hidden tab pauses heartbeat and nearby is not live', () => {
    const now = 100000;
    assert.equal(hb.shouldSendHeartbeat({ radarActive: true, visible: false, now, lastSentAt: null }), false);
    assert.equal(recon.nearbyIsLive({ radarActive: true, visible: false }), false);
    assert.equal(recon.nearbyIsLive({ radarActive: true, visible: true }), true);
  });

  it('foreground restore plan reconnects socket and reloads mission chat', () => {
    const hidden = recon.restorePlan({
      visible: false,
      hasSession: true,
      radarActiveIntent: true,
      connectionId: 'c1',
      socketConnected: false,
    });
    assert.equal(hidden.clearNearbyOnHide, true);
    assert.equal(hidden.restoreRadar, false);
    assert.equal(hidden.reconnectSocket, false);

    const shown = recon.restorePlan({
      visible: true,
      hasSession: true,
      radarActiveIntent: true,
      connectionId: 'c1',
      socketConnected: false,
    });
    assert.equal(shown.restoreSession, true);
    assert.equal(shown.reconnectSocket, true);
    assert.equal(shown.restoreRadar, true);
    assert.equal(shown.restoreMission, true);
    assert.equal(shown.restoreChat, true);
  });

  it('network errors are not hard auth failures; 401 is', () => {
    assert.equal(recon.isHardAuthFailure({ message: 'timeout' }), false);
    assert.equal(recon.isHardAuthFailure({ status: 503 }), false);
    assert.equal(recon.isHardAuthFailure({ code: 'UNAUTHORIZED' }), true);
    assert.equal(recon.isHardAuthFailure({ status: 401 }), true);
    assert.equal(recon.isHardAuthFailure({ message: 'Not authenticated' }), true);
  });

  it('client wires visibility restore, WS reconnect, and GET messages', () => {
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    const rt = fs.readFileSync(path.join(__dirname, 'realtime.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.match(app, /restoreForeground/);
    assert.match(app, /visibilitychange/);
    assert.match(app, /isHardAuthFailure/);
    assert.match(app, /listMessages/);
    assert.match(rt, /reconnect:/);
    assert.match(html, /presence-reconnect\.js/);
  });
});
