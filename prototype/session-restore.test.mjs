import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const SR = require('./session-restore.js');

describe('session restore routing', () => {
  it('documents actual token TTL (1h access / 30d refresh)', () => {
    assert.equal(SR.ACCESS_TTL_MS, 60 * 60 * 1000);
    assert.equal(SR.REFRESH_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  });

  it('no session after stored tokens → phone; first visit → splash', () => {
    assert.equal(SR.nextAuthedView({ hasSession: false }), 'v-phone');
    assert.equal(SR.bootView({ hasSession: false }), 'v-splash');
    assert.equal(SR.bootView({ hasSession: false, hadStoredTokens: true }), 'v-phone');
  });

  it('session + incomplete profile → profile (do not recreate if complete)', () => {
    assert.equal(SR.nextAuthedView({
      hasSession: true,
      profile: { gender: 'MALE', interestedIn: ['WOMEN'] },
      consents: ['CORE_MATCHING'],
    }), 'v-profile');
  });

  it('session + complete profile without core consent → consent', () => {
    assert.equal(SR.nextAuthedView({
      hasSession: true,
      profile: { firstName: 'Alex', birthDate: '1998-04-12', gender: 'MALE', interestedIn: ['WOMEN'] },
      consents: [],
    }), 'v-consent');
  });

  it('session + complete profile + core consent → Living Map (v-radar)', () => {
    assert.equal(SR.nextAuthedView({
      hasSession: true,
      profile: { firstName: 'Alex', birthDate: '1998-04-12', gender: 'FEMALE', interestedIn: ['MEN'] },
      consents: ['CORE_MATCHING', 'COARSE_LOCATION'],
    }), 'v-radar');
  });

  it('prefers server locale when present', () => {
    assert.equal(SR.localeFromProfile({ locale: 'fr' }, 'en'), 'fr');
    assert.equal(SR.localeFromProfile({}, 'en'), 'en');
  });
});
