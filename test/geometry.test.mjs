import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const geo = require('../ui/mods/com.lem0.pa-qol/shared/geometry.js');

const VIEW = { w: 1920, h: 1080 };
const OPTS = { minWidth: 200, minHeight: 100, defaults: { left: 40, top: 120, width: 360, height: 300 } };

test('valid geometry passes through unchanged', () => {
    const g = geo.clamp({ left: 100, top: 100, width: 400, height: 300 }, VIEW, OPTS);
    assert.deepEqual(g, { left: 100, top: 100, width: 400, height: 300 });
});

test('minimum size is enforced', () => {
    const g = geo.clamp({ left: 0, top: 0, width: 10, height: 10 }, VIEW, OPTS);
    assert.equal(g.width, 200);
    assert.equal(g.height, 100);
});

test('size is capped to the viewport', () => {
    const g = geo.clamp({ left: 0, top: 0, width: 5000, height: 5000 }, VIEW, OPTS);
    assert.equal(g.width, VIEW.w);
    assert.equal(g.height, VIEW.h);
});

test('off-screen positions are pulled back within reach', () => {
    const right = geo.clamp({ left: 99999, top: 100, width: 400, height: 300 }, VIEW, OPTS);
    assert.ok(right.left <= VIEW.w - 48);

    const left = geo.clamp({ left: -99999, top: 100, width: 400, height: 300 }, VIEW, OPTS);
    assert.ok(left.left + left.width >= 48);

    const below = geo.clamp({ left: 100, top: 99999, width: 400, height: 300 }, VIEW, OPTS);
    assert.ok(below.top <= VIEW.h - 48);

    const above = geo.clamp({ left: 100, top: -99999, width: 400, height: 300 }, VIEW, OPTS);
    assert.ok(above.top >= 0); // title bar never above the screen
});

test('garbage geometry falls back to defaults', () => {
    for (const garbage of [null, undefined, 'hello', 42,
        { left: NaN, top: 'x', width: null, height: Infinity }]) {
        const g = geo.clamp(garbage, VIEW, OPTS);
        assert.deepEqual(g, OPTS.defaults, JSON.stringify(garbage));
    }
});

test('smaller viewport shrinks a previously valid geometry', () => {
    const g = geo.clamp({ left: 1800, top: 1000, width: 400, height: 300 }, { w: 800, h: 600 }, OPTS);
    assert.ok(g.left <= 800 - 48);
    assert.ok(g.top <= 600 - 48);
    assert.ok(g.width <= 800);
    assert.ok(g.height <= 600);
});
