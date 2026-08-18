/**
 * Living Map Leaflet controller — full-screen background, overlay chrome.
 * Requires global L (Leaflet). No-op when Leaflet is missing.
 * Labels come from opts.t (i18n) — never hardcode product copy here.
 */
(function (global) {
  'use strict';

  var TILE = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
  /* OSM + CARTO are license-required for these tiles. Leaflet link is customary.
     Leaflet 1.9 default prefix injects a Ukraine-flag SVG — NOT a license requirement. */
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
  var LEAFLET_PREFIX = '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>';
  var HIT = 44;
  var LAYER_ZOOM = { radar: 15, discover: 14, pulse: 14 };

  function escAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/'/g, '&#39;');
  }

  function moodClass(mood) {
    if (mood === 'SUPER_READY') return 'lm-mood-ready';
    if (mood === 'EXPLORING') return 'lm-mood-explore';
    return 'lm-mood-open';
  }

  function createMapController(opts) {
    opts = opts || {};
    var LM = global.WingmanLivingMap;
    var map = null;
    var instanceId = 0;
    var userMarker = null;
    var layerGroup = null;
    var pulseGroup = null;
    var viewer = null;
    var markers = [];
    var zones = [];
    var selectedId = null;
    var lastZoom = 15;
    var layer = 'radar';
    var ignoreIdleUntil = 0;
    var selectLock = false;

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
      instanceId += 1;
      map = global.L.map(opts.el, {
        zoomControl: false,
        attributionControl: false,
        tap: true,
      });
      global.L.tileLayer(TILE, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);
      map.on('click', function () {
        if (Date.now() < ignoreIdleUntil) return;
        selectedId = null;
        paintSelected();
        if (opts.onMapIdle) opts.onMapIdle();
      });
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

    function paintSelected() {
      if (!layerGroup || !layerGroup.eachLayer) return;
      layerGroup.eachLayer(function (layer) {
        var el = layer.getElement && layer.getElement();
        if (!el) return;
        var hit = el.querySelector('.lm-opp');
        if (!hit) return;
        var on = Boolean(selectedId) && hit.getAttribute('data-candidate-id') === selectedId;
        hit.classList.toggle('is-selected', on);
        hit.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function emitSelect(payload, e) {
      if (!payload || !payload.candidateId) return;
      if (e && global.L && global.L.DomEvent) global.L.DomEvent.stop(e);
      if (selectLock) return;
      selectLock = true;
      setTimeout(function () { selectLock = false; }, 80);
      ignoreIdleUntil = Date.now() + 450;
      selectedId = payload.candidateId;
      paintSelected();
      if (opts.onSelect) opts.onSelect(payload);
    }

    function renderMarkers() {
      if (!map || !layerGroup || !LM) return;
      clearPeople();
      if (layer === 'pulse') return;
      var zoom = map.getZoom();
      var clustered = LM.clusterByGrid(markers, zoom);
      clustered.markers.forEach(function (m) {
        var payload = LM.selectionFromMarker(m);
        if (!payload) return;
        var selected = selectedId && selectedId === payload.candidateId;
        var cls = 'lm-opp ' + moodClass(m.moodState) + (m.destiny ? ' lm-destiny' : '') + (selected ? ' is-selected' : '');
        var label = (m.destiny ? t('lm_destiny') + ' ' : '') + t('lm_someone') + '. ' + moodLabel(m.moodState);
        var icon = global.L.divIcon({
          className: 'lm-opp-wrap',
          html: '<div class="' + cls + '" role="button" tabindex="-1" aria-pressed="' + (selected ? 'true' : 'false') +
            '" aria-label="' + escAttr(label) + '" data-candidate-id="' + escAttr(payload.candidateId) +
            '"><span class="lm-opp-core" aria-hidden="true"></span></div>',
          iconSize: [HIT, HIT],
          iconAnchor: [HIT / 2, HIT / 2],
        });
        var mk = global.L.marker([m.lat, m.lng], {
          icon: icon,
          keyboard: true,
          bubblingMouseEvents: false,
          zIndexOffset: selected ? 600 : 200,
        });
        mk.on('click', function (e) { emitSelect(payload, e); });
        mk.addTo(layerGroup);
        var el = mk.getElement && mk.getElement();
        if (el && global.L && global.L.DomEvent) {
          global.L.DomEvent.disableClickPropagation(el);
          global.L.DomEvent.on(el, 'click', function (ev) { emitSelect(payload, ev); });
          global.L.DomEvent.on(el, 'keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') emitSelect(payload, ev);
          });
        }
      });
      clustered.clusters.forEach(function (c) {
        var icon = global.L.divIcon({
          className: 'lm-cluster-wrap',
          html: '<div class="lm-cluster" role="button" tabindex="-1" aria-label="' + escAttr(c.count + ' ' + t('lm_count')) + '">' + c.count + '</div>',
          iconSize: [HIT, HIT],
          iconAnchor: [HIT / 2, HIT / 2],
        });
        var mk = global.L.marker([c.lat, c.lng], { icon: icon, keyboard: true, bubblingMouseEvents: false });
        mk.on('click', function (e) {
          if (global.L && global.L.DomEvent) global.L.DomEvent.stop(e);
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
      /* Overlay change only — never remount the Leaflet instance. */
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
      instanceId = 0;
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
      getInstanceId: function () { return instanceId; },
      getSelectedId: function () { return selectedId; },
      clearSelected: function () {
        selectedId = null;
        paintSelected();
      },
      moodLabel: moodLabel,
      bandLabel: bandLabel,
      lang: lang,
    };
  }

  global.WingmanLivingMapUi = {
    createMapController: createMapController,
    moodClass: moodClass,
    TILE_ATTR: TILE_ATTR,
    LEAFLET_PREFIX: LEAFLET_PREFIX,
    HIT: HIT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
