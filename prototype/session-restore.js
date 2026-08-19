/**
 * Durable session routing — restore identity without re-asking for phone.
 * Runtime identity = userId/session. Never surface tokens or phone.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WingmanSessionRestore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Must match @wingman/auth AUTH_ACCESS_TTL_MS / AUTH_REFRESH_TTL_MS. */
  var ACCESS_TTL_MS = 60 * 60 * 1000;
  var REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  function profileComplete(profile) {
    if (!profile || typeof profile !== 'object') return false;
    if (!String(profile.firstName || '').trim()) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(profile.birthDate || ''))) return false;
    if (!profile.gender) return false;
    if (!Array.isArray(profile.interestedIn) || profile.interestedIn.length < 1) return false;
    return true;
  }

  function hasCoreConsent(consents) {
    return Array.isArray(consents) && consents.indexOf('CORE_MATCHING') !== -1;
  }

  function nextAuthedView(opts) {
    opts = opts || {};
    if (!opts.hasSession) return 'v-phone';
    if (!profileComplete(opts.profile)) return 'v-profile';
    if (!hasCoreConsent(opts.consents)) return 'v-consent';
    return 'v-radar';
  }

  /**
   * Boot destination.
   * First visit (no stored tokens) → splash.
   * Stored tokens that failed restore → phone.
   * Valid session → skip onboarding unless profile/consent incomplete.
   */
  function bootView(opts) {
    opts = opts || {};
    if (opts.hasSession) return nextAuthedView(opts);
    if (opts.hadStoredTokens) return 'v-phone';
    return 'v-splash';
  }

  function localeFromProfile(profile, fallback) {
    var loc = profile && profile.locale;
    if (loc === 'fr' || loc === 'en') return loc;
    return fallback === 'fr' ? 'fr' : 'en';
  }

  /** localStorage keys used by prototype/api.js — never surface values in UI. */
  function hasLocalTokens() {
    try {
      return Boolean(
        localStorage.getItem('wingman_access_token') ||
        localStorage.getItem('wingman_refresh_token'),
      );
    } catch (_) {
      return false;
    }
  }

  /** Hold splash/onboarding while stored tokens are being restored. */
  function holdOnboarding(opts) {
    opts = opts || {};
    if (opts.hasSession) return false;
    return Boolean(opts.restoring || opts.hadStoredTokens);
  }

  return {
    ACCESS_TTL_MS: ACCESS_TTL_MS,
    REFRESH_TTL_MS: REFRESH_TTL_MS,
    profileComplete: profileComplete,
    hasCoreConsent: hasCoreConsent,
    nextAuthedView: nextAuthedView,
    localeFromProfile: localeFromProfile,
    bootView: bootView,
    hasLocalTokens: hasLocalTokens,
    holdOnboarding: holdOnboarding,
  };
});
