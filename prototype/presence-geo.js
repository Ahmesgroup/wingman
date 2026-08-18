/**
 * Coarse viewer location for Radar activate/heartbeat.
 * Fail closed: never invent Luxembourg (or any) fallback coords.
 * Other users' coordinates are never handled here — only the viewer's.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WingmanPresenceGeo = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** ~11m at the equator — matches server protectPrecision(4). */
  var DECIMALS = 4;

  function coarsen(lat, lng, decimals) {
    var d = decimals == null ? DECIMALS : decimals;
    var f = Math.pow(10, d);
    return {
      lat: Math.round(Number(lat) * f) / f,
      lng: Math.round(Number(lng) * f) / f,
    };
  }

  function isFiniteLoc(loc) {
    return Boolean(
      loc
      && Number.isFinite(loc.lat)
      && Number.isFinite(loc.lng)
      && loc.lat >= -90 && loc.lat <= 90
      && loc.lng >= -180 && loc.lng <= 180,
    );
  }

  /**
   * Location payload for POST /radar/activate.
   * Returns coarsened coords only when the browser granted location.
   */
  function activateLocation(viewerLoc, locState) {
    if (locState !== 'granted') return null;
    if (!isFiniteLoc(viewerLoc)) return null;
    return coarsen(viewerLoc.lat, viewerLoc.lng);
  }

  function heartbeatLocation(viewerLoc, locState) {
    return activateLocation(viewerLoc, locState);
  }

  function locMessageKey(locState) {
    if (locState === 'denied') return 'lm_loc_denied';
    if (locState === 'offline') return 'lm_offline';
    return 'lm_loc_off';
  }

  return {
    DECIMALS: DECIMALS,
    coarsen: coarsen,
    isFiniteLoc: isFiniteLoc,
    activateLocation: activateLocation,
    heartbeatLocation: heartbeatLocation,
    locMessageKey: locMessageKey,
  };
});
