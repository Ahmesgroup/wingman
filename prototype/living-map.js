/**
 * Living Map — privacy-safe opportunity rendering.
 * Markers are generated from distanceBand + bearingBucket around the VIEWER.
 * Never places another person at an exact received lat/lng (none are sent).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WingmanLivingMap = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_MARKERS = 100;
  var PULSE_MIN_THRESHOLD = 5;
  var RING_METERS = { VERY_CLOSE: 40, NEARBY: 95, AROUND_ME: 175 };
  var BEARING_DEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  var COORD_KEY = /"(lat|lng|latitude|longitude|exactMeters|meters|coordinates|path)"\s*:/i;

  function hash32(str) {
    var h = 2166136261;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function normalizeMood(mood) {
    if (mood === 'SUPER_READY' || mood === 'OPEN' || mood === 'EXPLORING') return mood;
    if (mood === 'UNSURE') return 'EXPLORING';
    return 'OPEN';
  }

  function destinationPoint(from, meters, bearingDeg) {
    var R = 6371000;
    var br = (bearingDeg * Math.PI) / 180;
    var lat1 = (from.lat * Math.PI) / 180;
    var lng1 = (from.lng * Math.PI) / 180;
    var ang = meters / R;
    var lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br),
    );
    var lng2 =
      lng1 +
      Math.atan2(
        Math.sin(br) * Math.sin(ang) * Math.cos(lat1),
        Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
      );
    return { lat: (lat2 * 180) / Math.PI, lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180 };
  }

  /**
   * Coarse display position inside the authorized visual zone.
   * Jitter is deterministic per opportunityId so markers do not jump.
   */
  function displayPosition(viewer, opportunity) {
    if (!viewer || !Number.isFinite(viewer.lat) || !Number.isFinite(viewer.lng)) return null;
    var band = opportunity && opportunity.distanceBand;
    var ring = RING_METERS[band] || RING_METERS.NEARBY;
    var base = BEARING_DEG[(opportunity && opportunity.bearingBucket) || 'N'];
    if (base == null) base = 0;
    var h = hash32((opportunity && opportunity.opportunityId) || (opportunity && opportunity.userId) || '');
    var jitterDeg = (h % 21) - 10;
    var jitterM = h % 16;
    return destinationPoint(viewer, ring + jitterM, base + jitterDeg);
  }

  function payloadLeaksCoordinates(value) {
    if (value == null) return false;
    try {
      return COORD_KEY.test(JSON.stringify(value));
    } catch (_) {
      return false;
    }
  }

  function opportunitiesToMarkers(opportunities, viewer, viewerId) {
    var list = Array.isArray(opportunities) ? opportunities : [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_MARKERS; i++) {
      var o = list[i];
      if (!o || typeof o !== 'object') continue;
      var id = o.opportunityId || o.userId;
      if (!id || seen[id]) continue;
      if (viewerId && o.userId === viewerId) continue;
      if (o.lat != null || o.lng != null || o.latitude != null || o.longitude != null) continue;
      var pos = displayPosition(viewer, o);
      if (!pos) continue;
      seen[id] = true;
      out.push({
        opportunityId: o.opportunityId || id,
        candidateId: o.opportunityId || id,
        userId: o.userId,
        lat: pos.lat,
        lng: pos.lng,
        distanceBand: o.distanceBand || 'NEARBY',
        bearingBucket: o.bearingBucket || 'N',
        moodState: normalizeMood(o.moodState || o.mood),
        intention: o.intention,
        presenceState: o.presenceState || 'AVAILABLE',
        contextTags: Array.isArray(o.contextTags) ? o.contextTags.slice(0, 5) : [],
        destiny: o.destiny === true,
        expiresAt: o.expiresAt,
      });
    }
    return out;
  }

  function clusterByGrid(markers, zoom) {
    var list = Array.isArray(markers) ? markers : [];
    if (list.length <= 1) return { markers: list, clusters: [] };
    var z = Number(zoom);
    if (!Number.isFinite(z) || z >= 16) return { markers: list, clusters: [] };
    var cell = z >= 14 ? 0.004 : z >= 12 ? 0.01 : 0.03;
    var buckets = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var gx = Math.floor(m.lng / cell);
      var gy = Math.floor(m.lat / cell);
      var key = gx + ':' + gy;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(m);
    }
    var singles = [];
    var clusters = [];
    Object.keys(buckets).forEach(function (key) {
      var group = buckets[key];
      if (group.length === 1) {
        singles.push(group[0]);
        return;
      }
      var slat = 0;
      var slng = 0;
      for (var j = 0; j < group.length; j++) {
        slat += group[j].lat;
        slng += group[j].lng;
      }
      clusters.push({
        lat: slat / group.length,
        lng: slng / group.length,
        count: group.length,
        members: group,
      });
    });
    return { markers: singles, clusters: clusters };
  }

  function isVisuallyEmpty(radarActive, markers) {
    return !radarActive || !markers || markers.length === 0;
  }

  /**
   * Pulse map zones — only buckets that meet the privacy threshold.
   * Never emits a 1-person blob. Display positions are coarse rings, not peer GPS.
   */
  function pulseZones(opportunities, viewer, threshold) {
    var min = threshold == null ? PULSE_MIN_THRESHOLD : threshold;
    var list = Array.isArray(opportunities) ? opportunities : [];
    if (list.length < min) return [];
    if (!viewer || !Number.isFinite(viewer.lat) || !Number.isFinite(viewer.lng)) return [];
    var buckets = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || typeof o !== 'object') continue;
      if (o.lat != null || o.lng != null || o.latitude != null || o.longitude != null) continue;
      var band = o.distanceBand || 'NEARBY';
      var sector = o.bearingBucket || 'N';
      var key = band + ':' + sector;
      if (!buckets[key]) buckets[key] = { distanceBand: band, bearingBucket: sector, count: 0 };
      buckets[key].count += 1;
    }
    var zones = [];
    Object.keys(buckets).forEach(function (key) {
      var b = buckets[key];
      if (b.count < min) return;
      var pos = displayPosition(viewer, {
        opportunityId: 'pulse:' + key,
        distanceBand: b.distanceBand,
        bearingBucket: b.bearingBucket,
      });
      if (!pos) return;
      zones.push({
        lat: pos.lat,
        lng: pos.lng,
        count: b.count,
        distanceBand: b.distanceBand,
        bearingBucket: b.bearingBucket,
      });
    });
    return zones;
  }

  /**
   * Living Map is the certified public surface (default ON).
   * Emergency rollback only: ?radar=canvas, livingMap=0, or serverEnabled/configEnabled === false.
   * Legacy ?livingMap=1 still forces the map on.
   */
  function resolveEnabled(opts) {
    opts = opts || {};
    var search = opts.search || '';
    try {
      var params = typeof search === 'string' ? new URLSearchParams(search.replace(/^\?/, '')) : search;
      if (params && params.get) {
        if (params.get('radar') === 'canvas') return false;
        if (params.get('livingMap') === '0') return false;
        if (params.get('livingMap') === '1') return true;
      }
    } catch (_) { /* ignore */ }
    if (opts.serverEnabled === false) return false;
    if (opts.configEnabled === false && opts.serverEnabled !== true) return false;
    return true;
  }

  function nearbyCount(markers) {
    return Array.isArray(markers) ? markers.length : 0;
  }

  /** Canonical empty copy is shown only when Radar is on and there are 0 actionable markers. */
  function emptyStateVisible(radarActive, candidateCount) {
    return Boolean(radarActive) && (candidateCount | 0) === 0;
  }

  /** Nearby count chrome is shown only when there is at least one actionable marker. */
  function countChromeVisible(radarActive, candidateCount) {
    return Boolean(radarActive) && (candidateCount | 0) > 0;
  }

  function emptyCountMutuallyExclusive(emptyVisible, nearbyCountValue) {
    return !((nearbyCountValue | 0) > 0 && emptyVisible);
  }

  /**
   * S35 “Selfie Signal” (camera before POST /signals) stays OFF.
   * Production Say hello is V3.1: create Signal, then live camera after accept.
   */
  function sayHelloOpensCamera() {
    return false;
  }

  var SELFIE_LEAD_STATES = {
    WAITING_FOR_INITIATOR_SELFIE: true,
    WAITING_FOR_RECIPIENT_SELFIE: true,
    WAITING_FOR_INITIATOR_APPROVAL: true,
  };
  var SELFIE_LEAD_HOLD_VIEWS = {
    'v-splash': true,
    'v-onboard1': true,
    'v-onboard2': true,
    'v-onboard3': true,
    'v-phone': true,
    'v-otp': true,
    'v-profile': true,
    'v-consent': true,
    'v-report': true,
    'v-report-done': true,
  };

  /**
   * When the Connection machine is in a selfie window, lead the actor to v-selfie
   * (live getUserMedia). Null if already there, not a selfie state, or auth/report hold.
   */
  function selfieLeadView(connectionState, currentViewId) {
    if (!SELFIE_LEAD_STATES[connectionState]) return null;
    if (currentViewId === 'v-selfie') return null;
    if (SELFIE_LEAD_HOLD_VIEWS[currentViewId]) return null;
    return 'v-selfie';
  }

  /**
   * Protocol selection — opaque ids only. Display lat/lng are never sent onward.
   */
  function selectionFromMarker(marker) {
    if (!marker || typeof marker !== 'object') return null;
    var candidateId = marker.candidateId || marker.opportunityId || marker.userId;
    if (!candidateId && !marker.userId) return null;
    var out = {
      candidateId: candidateId || marker.userId,
      opportunityId: marker.opportunityId || candidateId || marker.userId,
      userId: marker.userId,
      distanceBand: marker.distanceBand || 'NEARBY',
      bearingBucket: marker.bearingBucket,
      moodState: normalizeMood(marker.moodState || marker.mood),
      intention: marker.intention,
      presenceState: marker.presenceState || 'AVAILABLE',
      contextTags: Array.isArray(marker.contextTags) ? marker.contextTags.slice(0, 5) : [],
      destiny: marker.destiny === true,
    };
    if (marker.expiresAt) out.expiresAt = marker.expiresAt;
    return out;
  }

  return {
    MAX_MARKERS: MAX_MARKERS,
    PULSE_MIN_THRESHOLD: PULSE_MIN_THRESHOLD,
    RING_METERS: RING_METERS,
    hash32: hash32,
    normalizeMood: normalizeMood,
    destinationPoint: destinationPoint,
    displayPosition: displayPosition,
    payloadLeaksCoordinates: payloadLeaksCoordinates,
    opportunitiesToMarkers: opportunitiesToMarkers,
    clusterByGrid: clusterByGrid,
    pulseZones: pulseZones,
    isVisuallyEmpty: isVisuallyEmpty,
    resolveEnabled: resolveEnabled,
    nearbyCount: nearbyCount,
    emptyStateVisible: emptyStateVisible,
    countChromeVisible: countChromeVisible,
    emptyCountMutuallyExclusive: emptyCountMutuallyExclusive,
    sayHelloOpensCamera: sayHelloOpensCamera,
    selfieLeadView: selfieLeadView,
    selectionFromMarker: selectionFromMarker,
  };
});
