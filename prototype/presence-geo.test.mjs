import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const geo = require('./presence-geo.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('presence-geo fail-closed', () => {
  it('coarsens to ~11m (4 decimals)', () => {
    const c = geo.coarsen(49.61161234, 6.13191234);
    assert.equal(c.lat, 49.6116);
    assert.equal(c.lng, 6.1319);
  });

  it('activateLocation requires granted + finite coords', () => {
    assert.equal(geo.activateLocation({ lat: 48.8566, lng: 2.3522 }, 'denied'), null);
    assert.equal(geo.activateLocation({ lat: 48.8566, lng: 2.3522 }, 'unavailable'), null);
    assert.equal(geo.activateLocation(null, 'granted'), null);
    assert.equal(geo.activateLocation({ lat: 48.85661234, lng: 2.35221234 }, 'granted').lat, 48.8566);
  });

  it('never returns the Luxembourg lab fallback when denied', () => {
    const denied = geo.activateLocation({ lat: 49.6116, lng: 6.1319 }, 'denied');
    assert.equal(denied, null);
  });

  it('public activate path does not post hardcoded Luxembourg coords', () => {
    const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.match(src, /requestViewerLocation/);
    assert.match(src, /WingmanPresenceGeo/);
    const activateBlock = src.slice(src.indexOf("$('#radar-toggle')"), src.indexOf("$('#mood-select')"));
    assert.doesNotMatch(activateBlock, /49\.6116/);
    assert.doesNotMatch(activateBlock, /LM_FALLBACK/);
  });
});
