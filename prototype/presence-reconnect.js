/**
 * S32: tab hide/show restore policy. Heartbeat already pauses while hidden.
 * Restore real server state on foreground — never invent nearby people or
 * treat a network blip as logout.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WingmanPresenceReconnect = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isHardAuthFailure(err) {
    if (!err) return false;
    if (err.code === 'UNAUTHORIZED') return true;
    if (err.status === 401) return true;
    var msg = String(err.message || '');
    return msg === 'Not authenticated';
  }

  function nearbyIsLive(opts) {
    opts = opts || {};
    if (opts.visible === false) return false;
    return opts.radarActive === true;
  }

  function restorePlan(opts) {
    opts = opts || {};
    var visible = opts.visible !== false;
    var hasSession = Boolean(opts.hasSession);
    var radarActiveIntent = Boolean(opts.radarActiveIntent);
    var connectionId = opts.connectionId || null;
    var socketConnected = Boolean(opts.socketConnected);
    return {
      restoreSession: visible && hasSession,
      reconnectSocket: visible && hasSession && !socketConnected,
      restoreRadar: visible && hasSession && radarActiveIntent,
      restoreMission: visible && hasSession && Boolean(connectionId),
      restoreChat: visible && hasSession && Boolean(connectionId),
      clearNearbyOnHide: !visible,
      keepSessionOnTransientError: true,
    };
  }

  return {
    isHardAuthFailure: isHardAuthFailure,
    nearbyIsLive: nearbyIsLive,
    restorePlan: restorePlan,
  };
});
