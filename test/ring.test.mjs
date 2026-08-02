import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ringMod = require('../ui/mods/com.lem0.pat-qol/shared/ring.js');

test('newest first', () => {
    const r = ringMod.create(10);
    r.push(1); r.push(2); r.push(3);
    assert.deepEqual(r.items(), [3, 2, 1]);
    assert.equal(r.size(), 3);
});

test('cap is enforced, dropping the oldest', () => {
    const r = ringMod.create(3);
    for (let i = 1; i <= 5; i++) r.push(i);
    assert.deepEqual(r.items(), [5, 4, 3]);
});

test('setCap shrinks and grows', () => {
    const r = ringMod.create(5);
    for (let i = 1; i <= 5; i++) r.push(i);
    r.setCap(2);
    assert.deepEqual(r.items(), [5, 4]);
    r.setCap(4);
    r.push(6); r.push(7);
    assert.deepEqual(r.items(), [7, 6, 5, 4]);
});

test('invalid caps fall back to a sane default', () => {
    for (const bad of [0, -5, NaN, 'x', null, undefined]) {
        const r = ringMod.create(bad);
        assert.equal(r.cap(), 300, String(bad));
    }
    const huge = ringMod.create(1e9);
    assert.equal(huge.cap(), 5000);
});

test('remove deletes by identity and reports success', () => {
    const r = ringMod.create(5);
    const a = { k: 'a' }, b = { k: 'b' };
    r.push(a); r.push(b);
    assert.equal(r.remove(a), true);
    assert.deepEqual(r.items(), [b]);
    assert.equal(r.remove({ k: 'a' }), false); // identity, not equality
});

test('clear empties the buffer', () => {
    const r = ringMod.create(3);
    r.push(1);
    r.clear();
    assert.equal(r.size(), 0);
    assert.deepEqual(r.items(), []);
});
