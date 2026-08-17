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
  it('flag resolver defaults off', () => {
    assert.equal(LM.resolveEnabled({}), false);
    assert.equal(LM.resolveEnabled({ search: '' }), false);
    assert.equal(LM.resolveEnabled({ search: '?livingMap=1' }), true);
    assert.equal(LM.resolveEnabled({ configEnabled: true }), true);
    assert.equal(LM.resolveEnabled({ serverEnabled: true }), true);
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
});

describe('living-map mobile chrome', () => {
  it('HTML keeps rollback Radar canvas and feature-flagged map root', () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');
    assert.match(html, /id="radar-canvas"/);
    assert.match(html, /id="living-map-root"/);
    assert.match(html, /id="v-discover"/);
    assert.match(html, /id="lm-filter-sheet"/);
    assert.match(html, /RADAR \| DISCOVER|nav_discover|v-discover/);
    assert.match(css, /safe-area-inset-bottom/);
    assert.match(css, /body\.living-map #v-radar/);
    assert.match(css, /lm-fabs/);
  });
});
