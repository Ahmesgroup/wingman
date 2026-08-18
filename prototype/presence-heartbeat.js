/**
 * Presence TTL is 120s (Redis + domain). Keep Go active alive only while the
 * tab is foreground — never invent nearby people when presence has expired.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WingmanPresenceHeartbeat = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PRESENCE_TTL_MS = 120000;
  /** Well under Redis/domain TTL so a missed beat still has slack. */
  var HEARTBEAT_INTERVAL_MS = 40000;

  function shouldSendHeartbeat(opts) {
    opts = opts || {};
    if (!opts.radarActive) return false;
    if (opts.visible === false) return false;
    if (opts.force) return true;
    if (opts.lastSentAt == null) return true;
    var interval = opts.intervalMs == null ? HEARTBEAT_INTERVAL_MS : opts.intervalMs;
    return (opts.now - opts.lastSentAt) >= interval;
  }

  return {
    PRESENCE_TTL_MS: PRESENCE_TTL_MS,
    HEARTBEAT_INTERVAL_MS: HEARTBEAT_INTERVAL_MS,
    shouldSendHeartbeat: shouldSendHeartbeat,
  };
});
