/**
 * Production Radar mapping — real eligible candidates only.
 * Empty Radar is correct when alone. No demo / synthetic / fallback density.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WingmanRadarDots = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SLOT_POSITIONS = [
    { x: 0.3, y: 0.3 },
    { x: 0.68, y: 0.26 },
    { x: 0.74, y: 0.62 },
    { x: 0.4, y: 0.7 },
    { x: 0.24, y: 0.55 },
    { x: 0.55, y: 0.42 },
    { x: 0.18, y: 0.38 },
    { x: 0.82, y: 0.48 },
  ];

  function normalizeMood(mood) {
    if (mood === 'SUPER_READY' || mood === 'OPEN' || mood === 'EXPLORING') return mood;
    return 'OPEN';
  }

  /**
   * Map API candidates → canvas dots.
   * - drops missing ids
   * - never includes viewerId (self)
   * - dedupes by userId (first wins)
   */
  function candidatesToDots(candidates, viewerId) {
    var list = Array.isArray(candidates) ? candidates : [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || typeof c.userId !== 'string' || !c.userId) continue;
      if (viewerId && c.userId === viewerId) continue;
      if (seen[c.userId]) continue;
      seen[c.userId] = true;
      var pos = SLOT_POSITIONS[out.length % SLOT_POSITIONS.length];
      out.push({
        userId: c.userId,
        x: pos.x,
        y: pos.y,
        mood: normalizeMood(c.mood),
        age: '·',
        ageFr: '·',
        bio: typeof c.intention === 'string' ? c.intention : '',
        bioFr: typeof c.intention === 'string' ? c.intention : '',
        tags: [],
        band: c.approximateDistanceBand,
      });
    }
    return out;
  }

  /** nearbyCount === visibleDots; never invent density from empty API. */
  function nearbyCountFromDots(dots) {
    return Array.isArray(dots) ? dots.length : 0;
  }

  function isRadarVisuallyEmpty(radarActive, dots) {
    return !radarActive || nearbyCountFromDots(dots) === 0;
  }

  return {
    SLOT_POSITIONS: SLOT_POSITIONS,
    normalizeMood: normalizeMood,
    candidatesToDots: candidatesToDots,
    nearbyCountFromDots: nearbyCountFromDots,
    isRadarVisuallyEmpty: isRadarVisuallyEmpty,
  };
});
