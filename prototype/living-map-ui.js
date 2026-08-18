/**
 * Living Map Leaflet controller — full-screen background, overlay chrome.
 * Requires global L (Leaflet). No-op when Leaflet is missing.
 */
(function (global) {
  'use strict';

  var TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO';

  function moodClass(mood) {
    if (mood === 'SUPER_READY') return 'lm-mood-ready';
    if (mood === 'EXPLORING') return 'lm-mood-explore';
    return 'lm-mood-open';
  }

  function moodLabel(mood, lang) {
    var fr = (lang || (typeof document !== 'undefined' && document.documentElement.lang) || '') === 'fr';
    if (mood === 'SUPER_READY') return fr ? 'Prêt·e' : 'Super ready';
    if (mood === 'EXPLORING') return fr ? 'En exploration' : 'Exploring';
    return fr ? 'Ouvert·e' : 'Open';
  }

  function bandLabel(band, lang) {
    var fr = (lang || (typeof document !== 'undefined' && document.documentElement.lang) || '') === 'fr';
    if (band === 'VERY_CLOSE') return fr ? 'Très proche' : 'Very close';
    if (band === 'AROUND_ME') return fr ? 'Autour de moi' : 'Around me';
    return fr ? 'À proximité' : 'Nearby';
  }

  function createMapController(opts) {
    opts = opts || {};
    var LM = global.WingmanLivingMap;
    var map = null;
    var userMarker = null;
    var layerGroup = null;
    var viewer = null;
    var markers = [];
    var selectedId = null;
    var lastZoom = 15;

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
      map.setView([49.6116, 6.1319], 15);
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
          html: '<div class="lm-user" role="img" aria-label="You"></div>',
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
      map.setView([viewer.lat, viewer.lng], Math.max(map.getZoom(), 15), { animate: true });
    }

    function clearLayers() {
      if (layerGroup) layerGroup.clearLayers();
    }

    function renderMarkers() {
      if (!map || !layerGroup || !LM) return;
      clearLayers();
      var zoom = map.getZoom();
      var clustered = LM.clusterByGrid(markers, zoom);
      clustered.markers.forEach(function (m) {
        var cls = 'lm-opp ' + moodClass(m.moodState) + (m.destiny ? ' lm-destiny' : '');
        var icon = global.L.divIcon({
          className: 'lm-opp-wrap',
          html:
            '<button type="button" class="' +
            cls +
            '" aria-label="' +
            (m.destiny ? (document.documentElement.lang === 'fr' ? 'Vos chemins se sont recroisés. ' : 'Your paths crossed again. ') : '') +
            (document.documentElement.lang === 'fr' ? 'Quelqu’un à proximité. ' : 'Someone nearby. ') +
            moodLabel(m.moodState) +
            '"></button>',
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
          html: '<div class="lm-cluster" aria-label="' + c.count + ' opportunities">' + c.count + '</div>',
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

    function setOpportunities(opportunities, viewerId) {
      if (!LM || !viewer) {
        markers = [];
        renderMarkers();
        return markers;
      }
      markers = LM.opportunitiesToMarkers(opportunities, viewer, viewerId);
      renderMarkers();
      return markers;
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
      markers = [];
    }

    return {
      init: init,
      setViewer: setViewer,
      recenter: recenter,
      setOpportunities: setOpportunities,
      invalidate: invalidate,
      destroy: destroy,
      getViewer: function () { return viewer; },
      getMarkers: function () { return markers; },
      getSelectedId: function () { return selectedId; },
    };
  }

  global.WingmanLivingMapUi = {
    createMapController: createMapController,
    moodClass: moodClass,
    moodLabel: moodLabel,
    bandLabel: bandLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
