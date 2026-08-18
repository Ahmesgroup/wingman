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
    assert.equal(markers[0].candidateId, 'deadbeefdeadbeef');
    const pos = LM.displayPosition(viewer, opp);
    assert.ok(pos);
    assert.notEqual(pos.lat, viewer.lat);
    assert.notEqual(pos.lng, viewer.lng);
    assert.equal(markers[0].lat, pos.lat);
    assert.equal(LM.payloadLeaksCoordinates(opp), false);
    const sel = LM.selectionFromMarker(markers[0]);
    assert.equal(sel.candidateId, 'deadbeefdeadbeef');
    assert.equal(sel.userId, 'peer');
    assert.equal(sel.lat, undefined);
    assert.equal(sel.lng, undefined);
    assert.equal(LM.payloadLeaksCoordinates(sel), false);
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

describe('living-map P0 actionability', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const ui = readFileSync(join(dir, 'living-map-ui.js'), 'utf8');
  const app = readFileSync(join(dir, 'app.js'), 'utf8');
  const css = readFileSync(join(dir, 'styles.css'), 'utf8');
  const html = readFileSync(join(dir, 'index.html'), 'utf8');

  it('empty copy and nearby count are mutually exclusive', () => {
    assert.equal(LM.emptyStateVisible(true, 0), true);
    assert.equal(LM.emptyStateVisible(true, 1), false);
    assert.equal(LM.emptyStateVisible(false, 0), false);
    assert.equal(LM.countChromeVisible(true, 1), true);
    assert.equal(LM.countChromeVisible(true, 0), false);
    assert.equal(LM.emptyCountMutuallyExclusive(true, 1), false);
    assert.equal(LM.emptyCountMutuallyExclusive(false, 1), true);
    assert.equal(LM.emptyCountMutuallyExclusive(true, 0), true);
    const sync = app.slice(app.indexOf('function syncLivingMapEmpty'), app.indexOf('function setLocBanner'));
    assert.match(sync, /emptyStateVisible/);
    assert.match(sync, /countChromeVisible/);
    assert.doesNotMatch(sync, /lm_quiet/);
    assert.match(css, /lm-empty\{[^}]*pointer-events:none/);
  });

  it('nearby count equals actionable markers, never list.length fallback', () => {
    const refresh = app.slice(app.indexOf('async function refreshLivingMap'), app.indexOf('function scheduleLivingMapRefresh'));
    assert.match(refresh, /syncLivingMapEmpty\(markers && markers\.length \? markers\.length : 0\)/);
    assert.doesNotMatch(refresh, /markers\.length\) \|\| list\.length/);
  });

  it('marker tap binds a large hit target without an inner button and keeps candidateId', () => {
    const render = ui.slice(ui.indexOf('function renderMarkers'), ui.indexOf('function renderPulse'));
    assert.doesNotMatch(render, /<button type="button"/);
    assert.match(render, /role="button"/);
    assert.match(render, /data-candidate-id/);
    assert.match(render, /iconSize: \[HIT, HIT\]/);
    assert.match(ui, /var HIT = 44/);
    assert.match(ui, /bubblingMouseEvents: false/);
    assert.match(ui, /disableClickPropagation/);
    assert.match(ui, /emitSelect/);
    assert.match(css, /min-width:44px/);
    assert.match(css, /lm-opp\.is-selected/);
    assert.match(app, /data-candidate-id/);
    assert.match(app, /lm_sheet_title/);
    assert.match(app, /Someone nearby is open to meeting/);
    assert.match(app, /Une personne près de vous est ouverte à une rencontre/);
    assert.match(html, /id="lm-attrib"/);
  });

  it('map chrome sits above the transparent Radar view so markers receive taps', () => {
    assert.match(css, /body\.living-map\.lm-map-chrome #living-map-root\{z-index:2;pointer-events:auto\}/);
  });

  it('attribution has Leaflet + OSM + CARTO and no Ukraine flag', () => {
    assert.match(ui, /attributionControl: false/);
    assert.match(ui, /LEAFLET_PREFIX/);
    assert.doesNotMatch(ui, /leaflet-attribution-flag/);
    assert.doesNotMatch(html, /leaflet-attribution-flag/);
    assert.doesNotMatch(html, /#4C7BE1/);
    assert.match(html, /openstreetmap\.org\/copyright/);
    assert.match(html, /carto\.com\/attributions/);
    assert.match(html, /leafletjs\.com/);
    assert.match(css, /lm-attrib/);
  });

  it('Say hello from the sheet uses the existing Signal API with opaque userId', () => {
    const send = app.slice(app.indexOf("$('#send-signal-btn')"), app.indexOf("/* ------------------------------------------------------- radar toggle/mood"));
    assert.match(send, /api\.sendSignal/);
    assert.match(send, /receiverId: targetId/);
    assert.match(send, /currentDot && currentDot\.userId/);
    assert.match(send, /source: 'RADAR'/);
    assert.doesNotMatch(send, /sendSignal\([\s\S]*lat:/);
    assert.match(app, /selectionFromMarker/);
  });

  it('sheet Say hello does not open camera or bind selfie media (V3.1 order)', () => {
    const sendStart = app.indexOf("$('#send-signal-btn').addEventListener('click'");
    const send = app.slice(sendStart, app.indexOf("/* ------------------------------------------------------- radar toggle/mood"));
    assert.equal(LM.sayHelloOpensCamera(), false);
    assert.doesNotMatch(send, /startSelfieCamera\(/);
    assert.doesNotMatch(send, /getUserMedia/);
    assert.doesNotMatch(send, /uploadSelfieMedia/);
    assert.doesNotMatch(send, /api\.selfie\(/);
    assert.doesNotMatch(send, /show\('v-selfie'\)/);
    assert.match(send, /ensureRealtime/);
    assert.match(html, /id="selfie-video"/);
    assert.match(app, /getUserMedia/);
  });

  it('accept / match.created leads A to the live selfie screen', () => {
    assert.equal(LM.selfieLeadView('WAITING_FOR_INITIATOR_SELFIE', 'v-radar'), 'v-selfie');
    assert.equal(LM.selfieLeadView('WAITING_FOR_INITIATOR_SELFIE', 'v-discover'), 'v-selfie');
    assert.equal(LM.selfieLeadView('WAITING_FOR_RECIPIENT_SELFIE', 'v-pulse'), 'v-selfie');
    assert.equal(LM.selfieLeadView('WAITING_FOR_INITIATOR_APPROVAL', 'v-settings'), 'v-selfie');
    assert.equal(LM.selfieLeadView('WAITING_FOR_INITIATOR_SELFIE', 'v-selfie'), null);
    assert.equal(LM.selfieLeadView('WAITING_FOR_INITIATOR_SELFIE', 'v-phone'), null);
    assert.equal(LM.selfieLeadView('WAITING_FOR_INITIATOR_SELFIE', 'v-report'), null);
    assert.equal(LM.selfieLeadView('PENDING', 'v-radar'), null);
    assert.equal(LM.selfieLeadView('MISSION_MEET_ACTIVE', 'v-radar'), null);
    assert.match(app, /function leadToProtocolSelfie/);
    assert.match(app, /leadToProtocolSelfie\(p\.state\)/);
    assert.match(app, /env\.type === 'match\.created'/);
    const enterSelfie = app.slice(app.indexOf("if (id === 'v-selfie')"), app.indexOf("if (id === 'v-confirmed')"));
    assert.match(enterSelfie, /startSelfieCamera/);
  });

  it('attribution sits above the presence CTA and keeps 44px hit targets', () => {
    assert.match(css, /bottom:calc\(128px \+ var\(--safe-bottom\)\)/);
    assert.match(css, /\.lm-dock\{[^}]*bottom:calc\(72px \+ var\(--safe-bottom\)\)/);
    assert.match(ui, /var HIT = 44/);
    assert.match(css, /min-width:44px/);
    assert.match(css, /min-height:44px/);
  });
});
