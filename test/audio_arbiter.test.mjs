import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const arbiterMod = require('../ui/mods/com.lem0.pat-qol/shared/audio_arbiter.js');

function makeArbiter(config, opts = {}) {
    let t = 0;
    const clock = { now: () => t, advance: (ms) => { t += ms; } };
    const logs = [];
    const arbiter = arbiterMod.create({
        getConfig: () => config,
        now: clock.now,
        getWindowMs: opts.getWindowMs || (() => 3000),
        log: (level, m) => logs.push([level, m])
    });
    return { arbiter, clock, logs };
}

test('unknown event name fails open', () => {
    const { arbiter } = makeArbiter({});
    assert.equal(arbiter.decide(null).allow, true);
    assert.equal(arbiter.decide(undefined).allow, true);
});

test('unconfigured event fails open', () => {
    const { arbiter } = makeArbiter({ other: { enabled: true, priority: 3 } });
    assert.equal(arbiter.decide('mystery_event').allow, true);
});

test('config getter throwing fails open', () => {
    const arbiter = arbiterMod.create({
        getConfig: () => { throw new Error('boom'); },
        now: () => 0
    });
    assert.equal(arbiter.decide('x').allow, true);
});

test('disabled event is denied', () => {
    const { arbiter } = makeArbiter({ full_metal: { enabled: false, priority: 1 } });
    const d = arbiter.decide('full_metal');
    assert.equal(d.allow, false);
    assert.equal(d.why, 'disabled');
});

test('lower priority is denied inside the window, allowed after it', () => {
    const cfg = {
        commander_low_health: { enabled: true, priority: 6 },
        full_metal: { enabled: true, priority: 1 }
    };
    const { arbiter, clock } = makeArbiter(cfg);
    assert.equal(arbiter.decide('commander_low_health').allow, true);
    clock.advance(1000);
    assert.equal(arbiter.decide('full_metal').allow, false);   // outranked
    clock.advance(3001);
    assert.equal(arbiter.decide('full_metal').allow, true);    // window expired
});

test('higher or equal priority after lower is always allowed', () => {
    const cfg = {
        low: { enabled: true, priority: 1 },
        high: { enabled: true, priority: 6 }
    };
    const { arbiter, clock } = makeArbiter(cfg);
    assert.equal(arbiter.decide('low').allow, true);
    clock.advance(100);
    assert.equal(arbiter.decide('high').allow, true);
    clock.advance(100);
    assert.equal(arbiter.decide('high').allow, true);           // equal
});

test('deny path does not update the last-allowed state', () => {
    const cfg = {
        high: { enabled: true, priority: 5 },
        mid: { enabled: true, priority: 3 },
        low: { enabled: true, priority: 1 }
    };
    const { arbiter, clock } = makeArbiter(cfg);
    assert.equal(arbiter.decide('high').allow, true);
    clock.advance(500);
    assert.equal(arbiter.decide('mid').allow, false);
    clock.advance(500);
    // still outranked by 'high', not by the denied 'mid'
    assert.equal(arbiter.decide('low').allow, false);
});

test('invalid priority values are clamped to a sane default range', () => {
    const cfg = {
        weird: { enabled: true, priority: 'nope' },
        big: { enabled: true, priority: 99 }
    };
    const { arbiter } = makeArbiter(cfg);
    assert.equal(arbiter.decide('weird').allow, true);
    assert.equal(arbiter.decide('big').allow, true);
});

test('explicit disables NEVER trip the breaker (user intent, not malfunction)', () => {
    const cfg = { spam: { enabled: false, priority: 1 } };
    const { arbiter, clock } = makeArbiter(cfg);
    for (let i = 0; i < 200; i++) {
        clock.advance(100);
        assert.equal(arbiter.decide('spam').allow, false);
    }
    assert.equal(arbiter.bypass, false);
});

test('circuit breaker trips on sustained OUTRANKED denials and then passes everything', () => {
    const cfg = {
        alarm: { enabled: true, priority: 6 },
        chatter: { enabled: true, priority: 1 }
    };
    const { arbiter, clock, logs } = makeArbiter(cfg);
    assert.equal(arbiter.decide('alarm').allow, true); // establishes last={6}
    let tripped = false;
    for (let i = 0; i < 60; i++) {
        clock.advance(10); // stay inside the stomp window
        const d = arbiter.decide('chatter');
        if (d.allow) { tripped = true; break; }
    }
    assert.ok(tripped, 'breaker should trip within 60 outranked denials');
    assert.ok(arbiter.bypass);
    assert.ok(logs.some(([level]) => level === 'error'));
    // everything passes now, even disabled events
    assert.equal(arbiter.decide('chatter').allow, true);
});

test('reset() restores normal operation', () => {
    const cfg = {
        alarm: { enabled: true, priority: 6 },
        chatter: { enabled: true, priority: 1 },
        spam: { enabled: false, priority: 1 }
    };
    const { arbiter, clock } = makeArbiter(cfg);
    arbiter.decide('alarm');
    for (let i = 0; i < 60; i++) { clock.advance(10); arbiter.decide('chatter'); }
    assert.ok(arbiter.bypass);
    arbiter.reset();
    assert.equal(arbiter.decide('spam').allow, false);
});
