/**
 * Wingman API client — Nest local (:3000), auth via x-user-id (dev).
 * Never posts card data. Checkout unused while payments disabled.
 */
(function (global) {
  'use strict';

  const DEFAULT_BASE = 'http://localhost:3000';

  function createApiClient(opts) {
    opts = opts || {};
    const baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    let userId = opts.userId || (typeof localStorage !== 'undefined' && localStorage.getItem('wingman_user_id')) || 'proto-alex';
    let useMock = opts.useMock === true;

    function setUserId(id) {
      userId = id;
      try { localStorage.setItem('wingman_user_id', id); } catch (_) { /* ignore */ }
    }

    async function request(method, path, body, opts) {
      opts = opts || {};
      if (useMock) {
        const err = new Error('MOCK_MODE');
        err.code = 'MOCK_MODE';
        throw err;
      }
      const headers = {
        Accept: 'application/json',
        'x-user-id': opts.userId || userId,
      };
      if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(baseUrl + path, {
        method: method,
        headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
      if (!res.ok) {
        const err = new Error((data && data.error && data.error.message) || res.statusText);
        err.status = res.status;
        err.body = data;
        err.code = data && data.error && data.error.code;
        throw err;
      }
      return data;
    }

    /** Run a callback with a temporary x-user-id (demo dual-user loop). */
    async function asUser(tempUserId, fn) {
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
      setUserId: setUserId,
      setUseMock: function (v) { useMock = Boolean(v); },
      asUser: asUser,
      request: request,

      live: async function () {
        const res = await fetch(baseUrl + '/internal/live', { headers: { Accept: 'application/json' } });
        return res.ok;
      },

      seed: function (body) { return request('POST', '/dev/seed', body); },
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
    const api = createApiClient(opts);
    try {
      const ok = await Promise.race([
        api.live(),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 1500); }),
      ]);
      api.setUseMock(!ok);
    } catch (_) {
      api.setUseMock(true);
    }
    return api;
  }

  global.WingmanApi = { createApiClient: createApiClient, bootstrapApi: bootstrapApi };
})(typeof window !== 'undefined' ? window : globalThis);
