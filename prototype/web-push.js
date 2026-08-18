/**
 * S32 web push permission UX. Fails closed when VAPID/FCM credentials are
 * missing. Never claims success. Notification copy must not include phone
 * numbers or selfies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WingmanWebPush = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function canSubscribe(live) {
    return Boolean(
      live &&
      live.webPush &&
      live.webPush.enabled === true &&
      typeof live.webPush.vapidPublicKey === 'string' &&
      live.webPush.vapidPublicKey.length > 8,
    );
  }

  function payloadLooksPrivate(text) {
    var s = String(text || '');
    if (/\+\d{8,}/.test(s)) return true;
    if (/selfie/i.test(s)) return true;
    if (/phoneE164|phoneNumber/i.test(s)) return true;
    return false;
  }

  function publicCopy(type) {
    if (type === 'signal.received') return { title: 'Wingman', body: 'Someone nearby reached out' };
    if (type === 'mission.message') return { title: 'Wingman', body: 'New message in your meeting' };
    return { title: 'Wingman', body: 'You have a new update' };
  }

  function safeNotificationBody(type, raw) {
    var copy = publicCopy(type);
    if (payloadLooksPrivate(raw)) return copy.body;
    return copy.body;
  }

  /**
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  async function enable(opts) {
    opts = opts || {};
    if (!canSubscribe(opts.live)) {
      return { ok: false, reason: 'blocked_credentials' };
    }
    var permission = opts.permission;
    if (!permission && typeof opts.requestPermission === 'function') {
      permission = await opts.requestPermission();
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }
    if (typeof opts.subscribe !== 'function' || typeof opts.registerToken !== 'function') {
      return { ok: false, reason: 'blocked_credentials' };
    }
    var sub;
    try {
      sub = await opts.subscribe(opts.live.webPush.vapidPublicKey);
    } catch (_) {
      return { ok: false, reason: 'subscribe_failed' };
    }
    if (!sub) return { ok: false, reason: 'subscribe_failed' };
    try {
      await opts.registerToken(sub);
    } catch (_) {
      return { ok: false, reason: 'register_failed' };
    }
    return { ok: true };
  }

  return {
    canSubscribe: canSubscribe,
    payloadLooksPrivate: payloadLooksPrivate,
    publicCopy: publicCopy,
    safeNotificationBody: safeNotificationBody,
    enable: enable,
  };
});
