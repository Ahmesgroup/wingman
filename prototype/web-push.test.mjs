import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const push = require('./web-push.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('S32 web push fail-closed', () => {
  it('does not subscribe without VAPID/FCM public key', async () => {
    assert.equal(push.canSubscribe({}), false);
    assert.equal(push.canSubscribe({ webPush: { enabled: false, reason: 'vapid_or_fcm_credentials_missing' } }), false);
    const res = await push.enable({
      live: { webPush: { enabled: false } },
      permission: 'granted',
      subscribe: async function () { throw new Error('should not subscribe'); },
      registerToken: async function () { throw new Error('should not register'); },
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'blocked_credentials');
  });

  it('permission denied does not fake success even with credentials', async () => {
    const res = await push.enable({
      live: { webPush: { enabled: true, vapidPublicKey: 'B'.repeat(20) } },
      permission: 'denied',
      subscribe: async function () { return 'sub'; },
      registerToken: async function () { return true; },
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'permission_denied');
  });

  it('notification copy never includes phone or selfie', () => {
    assert.equal(push.payloadLooksPrivate('+352621000000'), true);
    assert.equal(push.payloadLooksPrivate('selfie.jpg'), true);
    const copy = push.publicCopy('signal.received');
    assert.equal(copy.title, 'Wingman');
    assert.doesNotMatch(copy.body, /\+\d/);
    assert.doesNotMatch(copy.body, /selfie/i);
    const mission = push.safeNotificationBody('mission.message', '+33600000000 selfie');
    assert.equal(mission, push.publicCopy('mission.message').body);
    assert.doesNotMatch(mission, /\+\d/);
    assert.doesNotMatch(mission, /selfie/i);
  });

  it('client ships permission UX and a service worker that fails closed without keys', () => {
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
    assert.match(app, /WingmanWebPush/);
    assert.match(app, /onPushSwitch/);
    assert.match(html, /web-push\.js/);
    assert.match(html, /id="set-push"/);
    assert.match(html, /id="set-push"[^>]*aria-checked="false"/);
    assert.match(sw, /showNotification/);
    assert.match(sw, /looksPrivate/);
    assert.match(sw, /You have a new update/);
  });
});
