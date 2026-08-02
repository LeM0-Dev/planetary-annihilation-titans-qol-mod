import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const fmt = require('../ui/mods/com.lem0.pat-qol/shared/timefmt.js');

test('formats minutes and seconds', () => {
    assert.equal(fmt.format(0), '0:00');
    assert.equal(fmt.format(61), '1:01');
    assert.equal(fmt.format(599), '9:59');
    assert.equal(fmt.format(600), '10:00');
});

test('formats hours', () => {
    assert.equal(fmt.format(3600), '1:00:00');
    assert.equal(fmt.format(3661), '1:01:01');
    assert.equal(fmt.format(7325), '2:02:05');
});

test('fractional seconds are floored', () => {
    assert.equal(fmt.format(61.9), '1:01');
});

test('invalid input renders as --:-- (never a wrong number)', () => {
    for (const bad of [null, undefined, NaN, -1, Infinity, -Infinity, 'x', {}]) {
        assert.equal(fmt.format(bad), '--:--', String(bad));
    }
});
