/**
 * Living Map Leaflet controller — full-screen background, overlay chrome.
 * Requires global L (Leaflet). No-op when Leaflet is missing.
 * Labels come from opts.t (i18n) — never hardcode product copy here.
 */
(function (global) {
  'use strict';

  var TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO';
  var LAYER_ZOOM = { radar: 15, discover: 14, pulse: 14 };

  function moodClass(mood) {
    if (mood === 'SUPER_READY') return 'lm-mood-ready';
    if (mood === 'EXPLORING') return 'lm-mood-explore';
    return 'lm-mood-open';
  }

  function createMapController(opts) {
    opts = opts || {};
    var LM = global.WingmanLivingMap;
    var map = null;
    var userMarker = null;
    var layerGroup = null;
    var pulseGroup = null;
    var viewer = null;
    var markers = [];
    var zones = [];
    var selectedId = null;
    var lastZoom = 15;
    var layer = 'radar';

    function t(key) {
      if (typeof opts.t === 'function') return opts.t(key);
      return key;
    }

    function lang() {
      return (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
    }

    function moodLabel(mood) {
      if (mood === 'SUPER_READY') return t('mood_ready');
      if (mood === 'EXPLORING') return t('mood_explore');
      return t('mood_open');
    }

    function bandLabel(band) {
      if (band === 'VERY_CLOSE') return t('lm_prox_close');
      if (band === 'AROUND_ME') return t('lm_prox_around');
      return t('lm_prox_near');
    }

    function ready() {
      return Boolean(global.L && opts.el);
    }

    function init() {
      if (map || !ready()) return map;
      map = global.L.map(opts.el, {
        zoomControl: false,
        attributionControl: true,
        tap: true,
      });
      global.L.tileLayer(TILE, { attribution: ATTR, maxZoom: 18 }).addTo(map);
      layerGroup = global.L.layerGroup().addTo(map);
      pulseGroup = global.L.layerGroup().addTo(map);
      map.setView([49.6116, 6.1319], LAYER_ZOOM.radar);
      map.on('zoomend', function () {
        var z = map.getZoom();
        if (z === lastZoom) return;
        lastZoom = z;
        renderMarkers();
      });
      return map;
    }

    function setViewer(latlng) {
      if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return;
      viewer = { lat: latlng.lat, lng: latlng.lng };
      if (!map) init();
      if (!map) return;
      if (!userMarker) {
        var icon = global.L.divIcon({
          className: 'lm-user-wrap',
          html: '<div class="lm-user" role="img" aria-label="' + t('lm_you') + '"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        userMarker = global.L.marker([viewer.lat, viewer.lng], { icon: icon, zIndexOffset: 1000, keyboard: false }).addTo(map);
      } else {
        userMarker.setLatLng([viewer.lat, viewer.lng]);
      }
    }

    function recenter() {
      if (!map || !viewer) return;
      var z = LAYER_ZOOM[layer] || 15;
      map.setView([viewer.lat, viewer.lng], Math.max(map.getZoom(), z), { animate: true });
    }

    function clearPeople() {
      if (layerGroup) layerGroup.clearLayers();
    }

    function clearPulse() {
      if (pulseGroup) pulseGroup.clearLayers();
    }

    function renderMarkers() {
      if (!map || !layerGroup || !LM) return;
      clearPeople();
      if (layer === 'pulse') return;
      var zoom = map.getZoom();
      var clustered = LM.clusterByGrid(markers, zoom);
      clustered.markers.forEach(function (m) {
        var cls = 'lm-opp ' + moodClass(m.moodState) + (m.destiny ? ' lm-destiny' : '');
        var label = (m.destiny ? t('lm_destiny') + ' ' : '') + t('lm_someone') + '. ' + moodLabel(m.moodState);
        var icon = global.L.divIcon({
          className: 'lm-opp-wrap',
          html: '<button type="button" class="' + cls + '" aria-label="' + label + '"></button>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        var mk = global.L.marker([m.lat, m.lng], { icon: icon, keyboard: true });
        mk.on('click', function () {
          selectedId = m.opportunityId;
          if (opts.onSelect) opts.onSelect(m);
        });
        mk.addTo(layerGroup);
      });
      clustered.clusters.forEach(function (c) {
        var icon = global.L.divIcon({
          className: 'lm-cluster-wrap',
          html: '<div class="lm-cluster" aria-label="' + c.count + ' ' + t('lm_count') + '">' + c.count + '</div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        var mk = global.L.marker([c.lat, c.lng], { icon: icon, keyboard: true });
        mk.on('click', function () {
          map.setView([c.lat, c.lng], Math.min(18, map.getZoom() + 2));
        });
        mk.addTo(layerGroup);
      });
    }

    function renderPulse() {
      if (!map || !pulseGroup || !LM) return;
      clearPulse();
      if (layer !== 'pulse') return;
      zones.forEach(function (z) {
        var meters = (LM.RING_METERS && LM.RING_METERS[z.distanceBand]) || 95;
        var circle = global.L.circle([z.lat, z.lng], {
          radius: Math.max(36, meters * 0.45),
          className: 'lm-pulse-zone',
          color: '#7C5CFC',
          weight: 1,
          fillColor: '#7C5CFC',
          fillOpacity: 0.22,
          interactive: false,
        });
        circle.addTo(pulseGroup);
        var icon = global.L.divIcon({
          className: 'lm-pulse-wrap',
          html: '<div class="lm-pulse-blob" aria-label="' + t('pulse_anon') + '">' + z.count + '</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        global.L.marker([z.lat, z.lng], { icon: icon, keyboard: false, interactive: false }).addTo(pulseGroup);
      });
    }

    function setOpportunities(opportunities, viewerId) {
      if (!LM || !viewer) {
        markers = [];
        zones = [];
        renderMarkers();
        renderPulse();
        return markers;
      }
      markers = LM.opportunitiesToMarkers(opportunities, viewer, viewerId);
      zones = LM.pulseZones(opportunities, viewer, LM.PULSE_MIN_THRESHOLD);
      renderMarkers();
      renderPulse();
      return markers;
    }

    function setLayer(next) {
      var name = next === 'discover' || next === 'pulse' ? next : 'radar';
      if (layer === name) {
        renderMarkers();
        renderPulse();
        return layer;
      }
      layer = name;
      if (map && viewer) {
        var z = LAYER_ZOOM[layer] || 15;
        map.setView([viewer.lat, viewer.lng], z, { animate: false });
      }
      renderMarkers();
      renderPulse();
      return layer;
    }

    function invalidate() {
      if (map) setTimeout(function () { map.invalidateSize(); }, 60);
    }

    function destroy() {
      if (map) {
        map.remove();
        map = null;
      }
      userMarker = null;
      layerGroup = null;
      pulseGroup = null;
      markers = [];
      zones = [];
    }

    return {
      init: init,
      setViewer: setViewer,
      recenter: recenter,
      setOpportunities: setOpportunities,
      setLayer: setLayer,
      invalidate: invalidate,
      destroy: destroy,
      getViewer: function () { return viewer; },
      getMarkers: function () { return markers; },
      getZones: function () { return zones; },
      getLayer: function () { return layer; },
      getSelectedId: function () { return selectedId; },
      moodLabel: moodLabel,
      bandLabel: bandLabel,
      lang: lang,
    };
  }

  global.WingmanLivingMapUi = {
    createMapController: createMapController,
    moodClass: moodClass,
  };
})(typeof window !== 'undefined' ? window : globalThis);
