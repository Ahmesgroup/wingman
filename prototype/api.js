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

    async function request(method, path, body) {
      if (useMock) {
        const err = new Error('MOCK_MODE');
        err.code = 'MOCK_MODE';
        throw err;
      }
      const headers = { Accept: 'application/json', 'x-user-id': userId };
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
        throw err;
      }
      return data;
    }

    return {
      get baseUrl() { return baseUrl; },
      get userId() { return userId; },
      get useMock() { return useMock; },
      setUserId: setUserId,
      setUseMock: function (v) { useMock = Boolean(v); },

      live: async function () {
        const res = await fetch(baseUrl + '/internal/live', { headers: { Accept: 'application/json' } });
        return res.ok;
      },

      seed: function (body) { return request('POST', '/dev/seed', body); },
      entitlements: function () { return request('GET', '/billing/entitlements'); },
      paymentsStatus: function () { return request('GET', '/billing/payments/status'); },
      checkout: function (urls) { return request('POST', '/billing/checkout', urls); },

      radarActivate: function (body) { return request('POST', '/radar/activate', body); },
      radarDeactivate: function () { return request('POST', '/radar/deactivate', {}); },
      radarCandidates: function (near, around) {
        return request('GET', '/radar/candidates?nearRadiusM=' + (near || 50) + '&aroundRadiusM=' + (around || 200));
      },

      sendSignal: function (body) { return request('POST', '/signals', body); },
      openSignal: function (id) { return request('POST', '/signals/' + id + '/open', {}); },
      acceptSignal: function (id) { return request('POST', '/signals/' + id + '/accept', {}); },

      connection: function (id) { return request('GET', '/connections/' + id); },
      selfie: function (id, body) { return request('POST', '/connections/' + id + '/selfie', body); },
      approve: function (id) { return request('POST', '/connections/' + id + '/approve', {}); },
      meetNow: function (id) { return request('POST', '/connections/' + id + '/meet-now', {}); },
      ticket: function (id) { return request('POST', '/connections/' + id + '/ticket', {}); },
      ticketAvailable: function (id) { return request('POST', '/connections/' + id + '/ticket/available', {}); },
      letsMeet: function (id) { return request('POST', '/connections/' + id + '/lets-meet', {}); },
      notThisTime: function (id) { return request('POST', '/connections/' + id + '/not-this-time', {}); },
      message: function (id, body) { return request('POST', '/connections/' + id + '/messages', body); },
      outcome: function (id, body) { return request('POST', '/connections/' + id + '/outcome', body); },
      block: function (body) { return request('POST', '/safety/block', body); },
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
