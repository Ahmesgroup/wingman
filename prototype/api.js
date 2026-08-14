/**
 * Wingman API client — Nest auth:
 * - Session mode: Bearer + x-device-id (S27 field path)
 * - Dev header mode: x-user-id only when explicitly allowed (local AUTH_ALLOW_DEV)
 * Never posts card data. Checkout unused while payments disabled.
 */
(function (global) {
  'use strict';

  const params = (typeof location !== 'undefined' && location.search)
    ? new URLSearchParams(location.search)
    : null;
  const DEFAULT_BASE = (params && params.get('api'))
    || (typeof localStorage !== 'undefined' && localStorage.getItem('wingman_api_base'))
    || 'http://localhost:3000';

  const AUTH_ACCESS = 'wingman_access_token';
  const AUTH_REFRESH = 'wingman_refresh_token';
  const AUTH_DEVICE = 'wingman_device_id';
  const AUTH_USER = 'wingman_user_id';
  const AUTH_PHONE = 'wingman_phone_e164';

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (_) { return null; }
  }
  function lsSet(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (_) { /* ignore */ }
  }

  function ensureDeviceId() {
    let id = lsGet(AUTH_DEVICE);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      lsSet(AUTH_DEVICE, id);
    }
    return id;
  }

  /** Dev header only on localhost / explicit ?devauth=1 — never on public Vercel field surface. */
  function allowDevHeader() {
    if (params && params.get('devauth') === '1') return true;
    const host = typeof location !== 'undefined' ? location.hostname : '';
    return host === 'localhost' || host === '127.0.0.1';
  }

  function createApiClient(opts) {
    opts = opts || {};
    const baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    let userId = opts.userId || lsGet(AUTH_USER) || null;
    let accessToken = lsGet(AUTH_ACCESS);
    let refreshToken = lsGet(AUTH_REFRESH);
    let deviceId = ensureDeviceId();
    let useMock = opts.useMock === true;
    const preferDevHeader = opts.preferDevHeader === true && allowDevHeader();

    function persistSession(sess) {
      if (!sess) return;
      accessToken = sess.accessToken || accessToken;
      refreshToken = sess.refreshToken || refreshToken;
      if (sess.userId) {
        userId = sess.userId;
        lsSet(AUTH_USER, userId);
      }
      lsSet(AUTH_ACCESS, accessToken);
      lsSet(AUTH_REFRESH, refreshToken);
    }

    function clearSession() {
      accessToken = null;
      refreshToken = null;
      lsSet(AUTH_ACCESS, null);
      lsSet(AUTH_REFRESH, null);
    }

    function setUserId(id) {
      userId = id;
      lsSet(AUTH_USER, id);
    }

    async function rawFetch(method, path, body, headersExtra) {
      const headers = Object.assign({ Accept: 'application/json' }, headersExtra || {});
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(baseUrl + path, {
        method: method,
        headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
      return { res: res, data: data };
    }

    async function request(method, path, body, reqOpts) {
      reqOpts = reqOpts || {};
      if (useMock) {
        const err = new Error('MOCK_MODE');
        err.code = 'MOCK_MODE';
        throw err;
      }
      const headers = {};
      if (accessToken && !reqOpts.forceDevHeader) {
        headers.Authorization = 'Bearer ' + accessToken;
        headers['x-device-id'] = deviceId;
      } else if (preferDevHeader || reqOpts.forceDevHeader) {
        headers['x-user-id'] = reqOpts.userId || userId || 'proto-alex';
      } else if (!reqOpts.public) {
        const err = new Error('Not authenticated');
        err.code = 'UNAUTHORIZED';
        throw err;
      }
      if (reqOpts.idempotencyKey) headers['idempotency-key'] = reqOpts.idempotencyKey;

      let out = await rawFetch(method, path, body, headers);
      if (out.res.status === 401 && refreshToken && accessToken && !reqOpts._retried) {
        try {
          const refreshed = await refreshSession();
          if (refreshed) {
            headers.Authorization = 'Bearer ' + accessToken;
            out = await rawFetch(method, path, body, headers);
          }
        } catch (_) { /* fall through */ }
      }
      if (!out.res.ok) {
        const err = new Error((out.data && out.data.error && out.data.error.message) || out.res.statusText);
        err.status = out.res.status;
        err.body = out.data;
        err.code = out.data && out.data.error && out.data.error.code;
        throw err;
      }
      return out.data;
    }

    async function refreshSession() {
      if (!refreshToken) return false;
      const out = await rawFetch('POST', '/auth/refresh', { refreshToken: refreshToken, deviceId: deviceId });
      if (!out.res.ok) {
        clearSession();
        return false;
      }
      persistSession(out.data);
      return true;
    }

    async function asUser(tempUserId, fn) {
      if (!preferDevHeader) {
        throw new Error('asUser requires local devauth');
      }
      const prev = userId;
      userId = tempUserId;
      try {
        return await fn();
      } finally {
        userId = prev;
      }
    }

    return {
      get baseUrl() { return baseUrl; },
      get userId() { return userId; },
      get useMock() { return useMock; },
      get deviceId() { return deviceId; },
      get hasSession() { return Boolean(accessToken); },
      get preferDevHeader() { return preferDevHeader; },
      setUserId: setUserId,
      setUseMock: function (v) { useMock = Boolean(v); },
      persistSession: persistSession,
      clearSession: clearSession,
      asUser: asUser,
      request: request,
      refreshSession: refreshSession,

      live: async function () {
        const res = await fetch(baseUrl + '/internal/live', { headers: { Accept: 'application/json' } });
        return res.ok;
      },

      requestOtp: function (phoneE164) {
        return request('POST', '/auth/otp/request', { phoneE164: phoneE164 }, { public: true });
      },
      verifyOtp: async function (phoneE164, code) {
        const sess = await request('POST', '/auth/otp/verify', {
          phoneE164: phoneE164,
          code: code,
          deviceId: deviceId,
        }, { public: true });
        persistSession(sess);
        lsSet(AUTH_PHONE, phoneE164);
        return sess;
      },
      logout: async function () {
        try {
          if (accessToken) await request('POST', '/auth/logout', {});
        } catch (_) { /* ignore */ }
        clearSession();
      },

      seed: function (body) { return request('POST', '/dev/seed', body, { forceDevHeader: true }); },
      entitlements: function () { return request('GET', '/billing/entitlements'); },
      paymentsStatus: function () { return request('GET', '/billing/payments/status'); },
      checkout: function (urls) { return request('POST', '/billing/checkout', urls); },

      radarActivate: function (body, opts) { return request('POST', '/radar/activate', body, opts); },
      radarDeactivate: function (opts) { return request('POST', '/radar/deactivate', {}, opts); },
      radarCandidates: function (near, around, opts) {
        return request('GET', '/radar/candidates?nearRadiusM=' + (near || 50) + '&aroundRadiusM=' + (around || 200), undefined, opts);
      },

      sendSignal: function (body, opts) { return request('POST', '/signals', body, opts); },
      openSignal: function (id, opts) { return request('POST', '/signals/' + id + '/open', {}, opts); },
      acceptSignal: function (id, opts) { return request('POST', '/signals/' + id + '/accept', {}, opts); },

      connection: function (id, opts) { return request('GET', '/connections/' + id, undefined, opts); },
      selfie: function (id, body, opts) { return request('POST', '/connections/' + id + '/selfie', body, opts); },
      approve: function (id, opts) { return request('POST', '/connections/' + id + '/approve', {}, opts); },
      meetNow: function (id, opts) { return request('POST', '/connections/' + id + '/meet-now', {}, opts); },
      ticket: function (id, opts) { return request('POST', '/connections/' + id + '/ticket', {}, opts); },
      ticketAvailable: function (id, opts) { return request('POST', '/connections/' + id + '/ticket/available', {}, opts); },
      ticketConfirm: function (id, opts) { return request('POST', '/connections/' + id + '/ticket/confirm', {}, opts); },
      letsMeet: function (id, opts) { return request('POST', '/connections/' + id + '/lets-meet', {}, opts); },
      finishMeet: function (id, opts) { return request('POST', '/connections/' + id + '/finish', {}, opts); },
      notThisTime: function (id, opts) { return request('POST', '/connections/' + id + '/not-this-time', {}, opts); },
      message: function (id, body, opts) { return request('POST', '/connections/' + id + '/messages', body, opts); },
      outcome: function (id, body, opts) { return request('POST', '/connections/' + id + '/outcome', body, opts); },
      cooldownSkip: function (id, opts) { return request('POST', '/connections/' + id + '/cooldown/skip', {}, opts); },
      block: function (body, opts) { return request('POST', '/safety/block', body, opts); },
    };
  }

  async function bootstrapApi(opts) {
    opts = opts || {};
    const api = createApiClient(opts);
    try {
      const ok = await Promise.race([
        api.live(),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 1500); }),
      ]);
      api.setUseMock(!ok);
      if (ok && api.hasSession) {
        await api.refreshSession().catch(function () { /* keep access until 401 */ });
      }
    } catch (_) {
      api.setUseMock(true);
    }
    return api;
  }

  global.WingmanApi = { createApiClient: createApiClient, bootstrapApi: bootstrapApi };
})(typeof window !== 'undefined' ? window : globalThis);
