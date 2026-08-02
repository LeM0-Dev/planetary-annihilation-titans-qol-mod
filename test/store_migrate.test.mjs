import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { createStore } = require('../ui/mods/com.lem0.pat-qol/core/store.js');
const schema = require('../ui/mods/com.lem0.pat-qol/shared/schema.js');

const PREFIX = 'com.lem0.pat-qol';

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; }
    };
}

function makeStore(storage, logs = []) {
    return createStore(storage, (level, m) => logs.push([level, m]), PREFIX);
}

const NOTIF_DEF = {
    version: 2,
    defaults: { low_metal: { enabled: true, priority: 2 } },
    migrate: (fromVersion, data) => {
        if (fromVersion === 1) {
            // v1 stored bare booleans; v2 stores {enabled, priority}
            const out = {};
            for (const k of Object.keys(data)) out[k] = { enabled: data[k], priority: 3 };
            return { version: 2, data: out };
        }
        return null;
    },
    validate: (d) => schema.check(d, schema.mapOf({
        enabled: schema.bool,
        priority: schema.intRange(0, 6)
    }))
};

test('absent key returns defaults without warnings', () => {
    const logs = [];
    const store = makeStore(fakeStorage(), logs);
    store.define('notifications', NOTIF_DEF);
    assert.deepEqual(store.get('notifications'), NOTIF_DEF.defaults);
    assert.equal(logs.length, 0);
});

test('set + flush round-trips through storage', () => {
    const storage = fakeStorage();
    const store = makeStore(storage);
    store.define('notifications', NOTIF_DEF);
    const value = { low_metal: { enabled: false, priority: 1 } };
    assert.ok(store.set('notifications', value));
    store.flush('notifications');
    assert.deepEqual(JSON.parse(storage.data[`${PREFIX}/notifications`]), { v: 2, d: value });

    // A second store instance re-reads the persisted value.
    const store2 = makeStore(storage);
    store2.define('notifications', NOTIF_DEF);
    assert.deepEqual(store2.get('notifications'), value);
});

test('v1 data migrates to v2', () => {
    const storage = fakeStorage({
        [`${PREFIX}/notifications`]: JSON.stringify({ v: 1, d: { low_metal: false } })
    });
    const store = makeStore(storage);
    store.define('notifications', NOTIF_DEF);
    assert.deepEqual(store.get('notifications'), { low_metal: { enabled: false, priority: 3 } });
});

test('corrupt JSON is backed up and replaced with defaults', () => {
    const storage = fakeStorage({ [`${PREFIX}/notifications`]: '{{{' });
    const logs = [];
    const store = makeStore(storage, logs);
    store.define('notifications', NOTIF_DEF);
    assert.deepEqual(store.get('notifications'), NOTIF_DEF.defaults);
    assert.ok(logs.some(([level]) => level === 'error'));
    const backupKeys = Object.keys(storage.data).filter((k) => k.includes('.corrupt.'));
    assert.equal(backupKeys.length, 1);
    assert.equal(storage.data[backupKeys[0]], '{{{');
});

test('malformed envelope is treated as corrupt', () => {
    const storage = fakeStorage({ [`${PREFIX}/notifications`]: JSON.stringify({ nope: 1 }) });
    const store = makeStore(storage);
    store.define('notifications', NOTIF_DEF);
    assert.deepEqual(store.get('notifications'), NOTIF_DEF.defaults);
});

test('future version (mod downgrade) is backed up and replaced with defaults', () => {
    const storage = fakeStorage({
        [`${PREFIX}/notifications`]: JSON.stringify({ v: 99, d: {} })
    });
    const store = makeStore(storage);
    store.define('notifications', NOTIF_DEF);
    assert.deepEqual(store.get('notifications'), NOTIF_DEF.defaults);
    assert.ok(Object.keys(storage.data).some((k) => k.includes('.corrupt.')));
});

test('validation failure on read falls back to defaults', () => {
    const storage = fakeStorage({
        [`${PREFIX}/notifications`]: JSON.stringify({ v: 2, d: { low_metal: { enabled: 'yes', priority: 42 } } })
    });
    const store = makeStore(storage);
    store.define('notifications', NOTIF_DEF);
    assert.deepEqual(store.get('notifications'), NOTIF_DEF.defaults);
});

test('set rejects invalid data and keeps the previous value', () => {
    const store = makeStore(fakeStorage());
    store.define('notifications', NOTIF_DEF);
    const before = store.get('notifications');
    assert.equal(store.set('notifications', { x: { enabled: true, priority: 99 } }), false);
    assert.deepEqual(store.get('notifications'), before);
});

test('undefined store names are refused', () => {
    const logs = [];
    const store = makeStore(fakeStorage(), logs);
    assert.equal(store.get('nope'), undefined);
    assert.equal(store.set('nope', {}), false);
    assert.ok(logs.length >= 2);
});

test('schema validators report precise paths', () => {
    const problems = schema.check(
        { a: { enabled: 'x', priority: 3 } },
        schema.mapOf({ enabled: schema.bool, priority: schema.intRange(0, 6) })
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /\$\.a\.enabled/);
});
