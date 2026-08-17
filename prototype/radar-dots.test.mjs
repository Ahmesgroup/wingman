import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const {
  candidatesToDots,
  nearbyCountFromDots,
  isRadarVisuallyEmpty,
} = require('./radar-dots.js');

describe('radar-dots production invariant', () => {
  it('one user only → nearbyCount=0, visibleDots=0', () => {
    const dots = candidatesToDots([], 'user-a');
    assert.equal(dots.length, 0);
    assert.equal(nearbyCountFromDots(dots), 0);
    assert.equal(isRadarVisuallyEmpty(true, dots), true);
  });

  it('two real users → nearbyCount=1, visibleDots=1', () => {
    const dots = candidatesToDots(
      [{ userId: 'user-b', mood: 'OPEN', approximateDistanceBand: 'NEAR' }],
      'user-a',
    );
    assert.equal(dots.length, 1);
    assert.equal(dots[0].userId, 'user-b');
    assert.equal(nearbyCountFromDots(dots), 1);
    assert.equal(isRadarVisuallyEmpty(true, dots), false);
  });

  it('self must never appear in own Radar', () => {
    const dots = candidatesToDots(
      [
        { userId: 'user-a', mood: 'SUPER_READY' },
        { userId: 'user-b', mood: 'OPEN' },
      ],
      'user-a',
    );
    assert.deepEqual(dots.map((d) => d.userId), ['user-b']);
  });

  it('duplicate presence → single visible dot', () => {
    const dots = candidatesToDots(
      [
        { userId: 'user-b', mood: 'OPEN' },
        { userId: 'user-b', mood: 'SUPER_READY' },
      ],
      'user-a',
    );
    assert.equal(dots.length, 1);
    assert.equal(dots[0].mood, 'OPEN');
  });

  it('empty / null / non-array candidates never invent density', () => {
    assert.equal(candidatesToDots(null, 'a').length, 0);
    assert.equal(candidatesToDots(undefined, 'a').length, 0);
    assert.equal(candidatesToDots({}, 'a').length, 0);
    assert.equal(nearbyCountFromDots(candidatesToDots([{ mood: 'OPEN' }], 'a')), 0);
  });

  it('inactive Radar is visually empty even if dots linger', () => {
    const dots = candidatesToDots([{ userId: 'b' }], 'a');
    assert.equal(isRadarVisuallyEmpty(false, dots), true);
  });
});
