/**
 * Minimal Socket.IO client for protocol sync (A↔B without refresh).
 * Requires global `io` from socket.io CDN. No-op when unavailable / offline.
 */
(function (global) {
  'use strict';

  function createRealtime(api, handlers) {
    handlers = handlers || {};
    let socket = null;
    let lastEventId = null;
    let subscribedConnectionId = null;

    function enabled() {
      return Boolean(
        api &&
        api.baseUrl &&
        !api.useMock &&
        !api.unreachable &&
        api.hasSession &&
        typeof global.io === 'function'
      );
    }

    function disconnect() {
      if (socket) {
        try { socket.close(); } catch (_) { /* ignore */ }
      }
      socket = null;
      subscribedConnectionId = null;
    }

    function connect() {
      disconnect();
      if (!enabled()) return null;
      const token = (function () {
        try { return localStorage.getItem('wingman_access_token'); } catch (_) { return null; }
      })();
      const deviceId = api.deviceId;
      if (!token) return null;
      socket = global.io(api.baseUrl, {
        path: '/ws',
        transports: ['websocket', 'polling'],
        auth: { token: token, deviceId: deviceId },
        reconnection: true,
        reconnectionDelay: 800,
        reconnectionDelayMax: 8000,
      });
      socket.on('ready', function () {
        if (handlers.onReady) handlers.onReady();
        if (lastEventId) socket.emit('resume', { lastEventId: lastEventId });
        if (subscribedConnectionId) {
          socket.emit('subscribe', {
            connectionId: subscribedConnectionId,
            missionId: subscribedConnectionId,
          });
        }
      });
      socket.on('event', function (env) {
        if (!env || !env.type) return;
        if (env.eventId) lastEventId = env.eventId;
        if (handlers.onEvent) handlers.onEvent(env);
      });
      socket.on('snapshot', function (snap) {
        if (handlers.onSnapshot) handlers.onSnapshot(snap);
      });
      socket.on('connect_error', function () {
        if (handlers.onError) handlers.onError();
      });
      return socket;
    }

    function subscribeConnection(connectionId) {
      subscribedConnectionId = connectionId || null;
      if (!socket || !socket.connected || !connectionId) return;
      socket.emit('subscribe', { connectionId: connectionId, missionId: connectionId });
    }

    return {
      connect: connect,
      disconnect: disconnect,
      subscribeConnection: subscribeConnection,
      get connected() { return Boolean(socket && socket.connected); },
    };
  }

  global.WingmanRealtime = { createRealtime: createRealtime };
})(typeof window !== 'undefined' ? window : globalThis);
