import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const LM = require('./living-map.js');

const viewer = { lat: 49.6116, lng: 6.1319 };

describe('living-map production invariant', () => {
  it('flag resolver defaults on; canvas query is rollback', () => {
    assert.equal(LM.resolveEnabled({}), true);
    assert.equal(LM.resolveEnabled({ search: '' }), true);
    assert.equal(LM.resolveEnabled({ search: '?livingMap=1' }), true);
    assert.equal(LM.resolveEnabled({ search: '?radar=canvas' }), false);
    assert.equal(LM.resolveEnabled({ search: '?livingMap=0' }), false);
    assert.equal(LM.resolveEnabled({ configEnabled: true }), true);
    assert.equal(LM.resolveEnabled({ serverEnabled: true }), true);
    assert.equal(LM.resolveEnabled({ serverEnabled: false }), false);
    assert.equal(LM.resolveEnabled({ configEnabled: false }), false);
    assert.equal(LM.resolveEnabled({ configEnabled: false, serverEnabled: true }), true);
    assert.equal(LM.resolveEnabled({ search: '?radar=canvas', serverEnabled: true }), false);
    assert.equal(LM.resolveEnabled({ configEnabled: undefined }), true);
  });

  it('0 opportunities → 0 markers', () => {
    const markers = LM.opportunitiesToMarkers([], viewer, 'me');
    assert.equal(markers.length, 0);
    assert.equal(LM.nearbyCount(markers), 0);
    assert.equal(LM.isVisuallyEmpty(true, markers), true);
  });

  it('self never appears as a marker', () => {
    const markers = LM.opportunitiesToMarkers(
      [{ opportunityId: 'abc', userId: 'me', distanceBand: 'NEARBY', bearingBucket: 'N', moodState: 'OPEN' }],
      viewer,
      'me',
    );
    assert.equal(markers.length, 0);
  });

  it('1 eligible opportunity → 1 marker at coarse display position, not peer coords', () => {
    const opp = {
      opportunityId: 'deadbeefdeadbeef',
      userId: 'peer',
      distanceBand: 'NEARBY',
      bearingBucket: 'NE',
      moodState: 'OPEN',
      contextTags: ['Music'],
    };
    const markers = LM.opportunitiesToMarkers([opp], viewer, 'me');
    assert.equal(markers.length, 1);
    assert.equal(markers[0].userId, 'peer');
    const pos = LM.displayPosition(viewer, opp);
    assert.ok(pos);
    assert.notEqual(pos.lat, viewer.lat);
    assert.notEqual(pos.lng, viewer.lng);
    assert.equal(markers[0].lat, pos.lat);
    assert.equal(LM.payloadLeaksCoordinates(opp), false);
  });

  it('drops payloads that include exact peer coordinates', () => {
    const leaked = LM.opportunitiesToMarkers(
      [{ opportunityId: 'x', userId: 'p', lat: 49.61, lng: 6.13, distanceBand: 'NEARBY', bearingBucket: 'N' }],
      viewer,
      'me',
    );
    assert.equal(leaked.length, 0);
  });

  it('inactive Radar is visually empty even if markers linger', () => {
    const markers = LM.opportunitiesToMarkers(
      [{ opportunityId: 'a', userId: 'p', distanceBand: 'VERY_CLOSE', bearingBucket: 'S', moodState: 'SUPER_READY' }],
      viewer,
      'me',
    );
    assert.equal(LM.isVisuallyEmpty(false, markers), true);
    assert.equal(LM.isVisuallyEmpty(true, markers), false);
  });

  it('clusters at low zoom; singles at high zoom', () => {
    const many = [];
    for (let i = 0; i < 12; i++) {
      many.push({
        opportunityId: 'id' + i,
        userId: 'u' + i,
        distanceBand: 'AROUND_ME',
        bearingBucket: 'N',
        moodState: 'OPEN',
      });
    }
    const markers = LM.opportunitiesToMarkers(many, viewer, 'me');
    const low = LM.clusterByGrid(markers, 12);
    assert.ok(low.clusters.length >= 1 || low.markers.length === markers.length);
    const high = LM.clusterByGrid(markers, 17);
    assert.equal(high.clusters.length, 0);
    assert.equal(high.markers.length, markers.length);
  });

  it('display position is stable for the same opportunityId', () => {
    const opp = { opportunityId: 'stableid00000001', distanceBand: 'VERY_CLOSE', bearingBucket: 'W' };
    const a = LM.displayPosition(viewer, opp);
    const b = LM.displayPosition(viewer, opp);
    assert.deepEqual(a, b);
  });

  it('Pulse zones stay empty below threshold and never use peer coordinates', () => {
    const one = [{ opportunityId: 'a', userId: 'p', distanceBand: 'NEARBY', bearingBucket: 'N', moodState: 'OPEN' }];
    assert.equal(LM.pulseZones(one, viewer).length, 0);
    const many = [];
    for (let i = 0; i < LM.PULSE_MIN_THRESHOLD; i++) {
      many.push({
        opportunityId: 'z' + i,
        userId: 'u' + i,
        distanceBand: 'NEARBY',
        bearingBucket: 'N',
        moodState: 'OPEN',
      });
    }
    const zones = LM.pulseZones(many, viewer);
    assert.equal(zones.length, 1);
    assert.ok(zones[0].count >= LM.PULSE_MIN_THRESHOLD);
    assert.equal(LM.payloadLeaksCoordinates(many), false);
    const leaked = LM.pulseZones(
      many.map((o, i) => Object.assign({}, o, { lat: 49.61, lng: 6.13, opportunityId: 'leak' + i })),
      viewer,
    );
    assert.equal(leaked.length, 0);
  });
});

describe('living-map mobile chrome', () => {
  it('HTML keeps rollback Radar canvas and default Living Map root', () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');
    const ui = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'living-map-ui.js'), 'utf8');
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.js'), 'utf8');
    assert.match(html, /id="radar-canvas"/);
    assert.match(html, /id="living-map-root"/);
    assert.match(html, /id="lm-nav"/);
    assert.match(html, /id="v-discover"/);
    assert.match(html, /id="lm-filter-sheet"/);
    assert.match(html, /id="lm-discover-tray"/);
    assert.match(html, /id="lm-pulse-panel"/);
    assert.match(html, /id="lm-destiny-banner"/);
    assert.match(html, /RADAR \| DISCOVER|nav_discover|v-discover/);
    assert.match(css, /safe-area-inset-bottom/);
    assert.match(css, /body\.living-map #v-radar/);
    assert.match(css, /body\.living-map #radar-canvas/);
    assert.match(css, /lm-dock/);
    assert.match(css, /lm-preauth/);
    assert.match(css, /#lm-nav/);
    assert.match(ui, /dark_nolabels/);
    assert.match(css, /lm-opp-core/);
    assert.doesNotMatch(css, /lm-empty\{[^}]*backdrop-filter/);
    assert.match(app, /applyLivingMapFlag\(\)/);
    assert.match(app, /if \(!canvas \|\| !ctx \|\| state\.livingMap\) return/);
  });

  it('certified path hides canvas Radar whenever Living Map is on (not only when near)', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');
    assert.match(css, /body\.living-map #radar-canvas/);
    assert.doesNotMatch(css, /body\.living-map\[data-lm-world="near"\][^{]*#radar-canvas/);
    assert.doesNotMatch(css, /body\.living-map:not\(\[data-lm-world="near"\]\) #living-map-root\{visibility:hidden/);
  });

  it('tab switch changes overlay without remounting the map instance', () => {
    const ui = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'living-map-ui.js'), 'utf8');
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.js'), 'utf8');
    const setLayer = ui.slice(ui.indexOf('function setLayer'), ui.indexOf('function invalidate'));
    assert.doesNotMatch(setLayer, /destroy|remove\(\)|L\.map/);
    const setWorld = app.slice(app.indexOf('function setLivingMapWorld'), app.indexOf('function setLivingMapMoodOpen'));
    assert.doesNotMatch(setWorld, /destroy\(/);
    assert.match(setWorld, /setLayer/);
    assert.match(ui, /getInstanceId/);
  });

  it('0 candidates keep the map — never disable Living Map or start canvas', () => {
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.js'), 'utf8');
    const refresh = app.slice(app.indexOf('async function refreshLivingMap'), app.indexOf('function scheduleLivingMapRefresh'));
    assert.match(refresh, /syncLivingMapEmpty\(0\)/);
    assert.doesNotMatch(refresh, /disableLivingMapUi/);
    assert.doesNotMatch(refresh, /startRadar/);
    assert.match(app, /Quiet around you/);
    assert.match(app, /We'll let you know when an opportunity appears nearby/);
    assert.match(app, /C'est calme autour de vous/);
    assert.match(app, /Nous vous préviendrons lorsqu'une opportunité apparaîtra près de vous/);
  });

  it('Living Map flag is applied synchronously before canvas Radar starts', () => {
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app.js'), 'utf8');
    const boot = app.slice(app.indexOf('state.lang = readStoredLang()'));
    assert.ok(boot.indexOf('applyLivingMapFlag()') < boot.indexOf('startRadar()'));
    assert.match(app, /configEnabled: cfg\.livingMap !== false/);
  });
});
