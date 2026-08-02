import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const hvt = require('../ui/mods/com.lem0.pa-qol/shared/hvt_classify.js');

// Build a unit_types [i32,i32,i32,i32] fixture from bit indices, using the
// same layout as eventSystem.isType: bit b -> section [3 - floor(b/32)].
function bits(...indices) {
    const arr = [0, 0, 0, 0];
    for (const b of indices) arr[3 - Math.floor(b / 32)] |= (1 << (b % 32));
    return arr;
}

const B = hvt.BITS;

test('isType matches the base game bit layout', () => {
    assert.ok(hvt.isType(0, bits(0)));
    assert.ok(hvt.isType(31, bits(31)));         // high bit of section 3
    assert.ok(hvt.isType(32, bits(32)));         // crosses into section 2
    assert.ok(hvt.isType(55, bits(55)));         // Important
    assert.ok(!hvt.isType(31, bits(30)));
    assert.ok(!hvt.isType(55, bits(54)));
});

test('classifies each category', () => {
    assert.equal(hvt.classify(bits(B.Commander), '/pa/units/commanders/x/x.json').key, 'commander');
    assert.equal(hvt.classify(bits(B.Titan), '/pa/units/land/titan_bot/titan_bot.json').key, 'titan');
    assert.equal(hvt.classify(bits(B.Nuke), '/pa/units/land/nuke_launcher/nuke_launcher.json').key, 'nuke');
    assert.equal(hvt.classify(bits(B.NukeDefense), '/pa/units/land/anti_nuke_launcher/a.json').key, 'antinuke');
    assert.equal(hvt.classify(bits(B.ControlModule), '/pa/units/land/control_module/c.json').key, 'catalyst');
    assert.equal(hvt.classify(bits(B.PlanetEngine), '/pa/units/orbital/delta_v_engine/d.json').key, 'halley');
    assert.equal(hvt.classify(bits(B.Teleporter), '/pa/units/land/teleporter/t.json').key, 'teleporter');
});

test('unit cannon is matched by spec path (no dedicated bit)', () => {
    assert.equal(hvt.classify(bits(), '/pa/units/land/unit_cannon/unit_cannon.json').key, 'unit_cannon');
    // path match wins even with other bits set (base game behaviour)
    assert.equal(hvt.classify(bits(B.Titan), '/pa/units/land/unit_cannon/unit_cannon.json').key, 'unit_cannon');
});

test('colonel (SupportCommander bit) and angel (path match)', () => {
    // Colonel: bot_support_commander carries SupportCommander, no Commander
    assert.equal(hvt.classify(bits(B.SupportCommander), '/pa/units/land/bot_support_commander/bot_support_commander.json').key, 'colonel');
    // Angel: support_platform has no HVT bit at all
    assert.equal(hvt.classify(bits(), '/pa/units/air/support_platform/support_platform.json').key, 'angel');
    // a real commander is never demoted to colonel
    assert.equal(hvt.classify(bits(B.Commander, B.SupportCommander), '/pa/units/commanders/x/x.json').key, 'commander');
});

test('ControlModule=28 vs PlanetEngine=29 boundary', () => {
    assert.equal(hvt.classify(bits(28), 'x.json').key, 'catalyst');
    assert.equal(hvt.classify(bits(29), 'x.json').key, 'halley');
});

test('priority order: commander > titan > nuke', () => {
    assert.equal(hvt.classify(bits(B.Commander, B.Titan), 'x.json').key, 'commander');
    assert.equal(hvt.classify(bits(B.Titan, B.Teleporter), 'x.json').key, 'titan');
});

test('non-HVT and malformed input return null without throwing', () => {
    assert.equal(hvt.classify(bits(12 /* Structure */), '/pa/units/land/metal_extractor/m.json'), null);
    assert.equal(hvt.classify(null, null), null);
    assert.equal(hvt.classify([1, 2], 'x.json'), null);                 // short array
    assert.equal(hvt.classify(['a', 'b', 'c', 'd'], 'x.json'), null);   // non-numbers
    assert.equal(hvt.classify(undefined, undefined), null);
});
