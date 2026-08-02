// PA QoL — namespaced, versioned, validated localStorage store. ES5 only.
// Disk key:  "com.lem0.pa-qol/<name>"
// Envelope:  {"v": <int>, "d": <payload>}
// Corrupt or invalid data is BACKED UP (key + '.corrupt.<epoch>') and replaced
// with defaults — never silently destroyed (Rule 7).
// The factory is exported for node tests with an in-memory storage fake.
(function () {
    'use strict';

    function createStore(storage, log, prefix) {
        var defs = {};      // name -> {version, defaults, migrate, validate}
        var cache = {};     // name -> payload
        var timers = {};    // name -> setTimeout id (debounced writes)
        var broken = false; // set on QuotaExceeded; persistence off for session

        function key(name) { return prefix + '/' + name; }

        function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

        function backup(name, raw, reason) {
            log('error', 'store "' + name + '": ' + reason + '; using defaults. ' +
                'The old value was backed up.');
            try {
                storage.setItem(key(name) + '.corrupt.' + Date.now(), raw);
            } catch (e) { /* backup is best-effort */ }
        }

        function load(name) {
            var def = defs[name];
            var raw = null;
            try { raw = storage.getItem(key(name)); } catch (e) { raw = null; }
            if (raw === null || raw === undefined) return clone(def.defaults);

            var env;
            try { env = JSON.parse(raw); } catch (e) {
                backup(name, raw, 'stored JSON does not parse');
                return clone(def.defaults);
            }
            if (!env || typeof env !== 'object' || typeof env.v !== 'number') {
                backup(name, raw, 'stored envelope is malformed');
                return clone(def.defaults);
            }

            var version = env.v;
            var data = env.d;

            if (version > def.version) {
                backup(name, raw, 'stored version ' + version + ' is newer than supported ' +
                    def.version + ' (mod was downgraded?)');
                return clone(def.defaults);
            }
            if (version < def.version) {
                if (typeof def.migrate !== 'function') {
                    backup(name, raw, 'no migration from version ' + version);
                    return clone(def.defaults);
                }
                try {
                    var migrated = def.migrate(version, data);
                    if (!migrated || migrated.version !== def.version) {
                        backup(name, raw, 'migration from version ' + version + ' did not reach ' + def.version);
                        return clone(def.defaults);
                    }
                    data = migrated.data;
                } catch (e) {
                    backup(name, raw, 'migration from version ' + version + ' threw');
                    return clone(def.defaults);
                }
            }

            if (typeof def.validate === 'function') {
                var problems;
                try { problems = def.validate(data) || []; } catch (e) { problems = ['validator threw: ' + e.message]; }
                if (problems.length) {
                    backup(name, raw, 'validation failed: ' + problems.slice(0, 5).join('; '));
                    return clone(def.defaults);
                }
            }
            return data;
        }

        function write(name) {
            if (broken) return;
            var env = JSON.stringify({ v: defs[name].version, d: cache[name] });
            try {
                storage.setItem(key(name), env);
            } catch (e) {
                broken = true;
                log('error', 'store: writing "' + name + '" failed (storage quota?); ' +
                    'persistence is disabled for this session.');
            }
        }

        return {
            define: function (name, def) {
                if (defs[name]) { log('warn', 'store.define: "' + name + '" already defined; ignored.'); return; }
                if (!def || typeof def.version !== 'number') {
                    log('error', 'store.define: "' + name + '" needs a numeric version.');
                    return;
                }
                defs[name] = def;
            },
            get: function (name) {
                if (!defs[name]) { log('error', 'store.get: "' + name + '" is not defined.'); return undefined; }
                if (!(name in cache)) cache[name] = load(name);
                return cache[name];
            },
            set: function (name, value) {
                if (!defs[name]) { log('error', 'store.set: "' + name + '" is not defined.'); return false; }
                var def = defs[name];
                if (typeof def.validate === 'function') {
                    var problems;
                    try { problems = def.validate(value) || []; } catch (e) { problems = ['validator threw: ' + e.message]; }
                    if (problems.length) {
                        log('error', 'store.set: "' + name + '" rejected: ' + problems.slice(0, 5).join('; '));
                        return false;
                    }
                }
                cache[name] = value;
                // Debounce disk writes (drag/resize spam); cache is already fresh.
                if (timers[name]) clearTimeout(timers[name]);
                timers[name] = setTimeout(function () {
                    delete timers[name];
                    write(name);
                }, 250);
                return true;
            },
            // Drop the page-local cache and re-read from storage. Used to pick
            // up changes written by another scene (e.g. the in-game settings
            // panel is a separate page sharing the same localStorage).
            reload: function (name) {
                if (!defs[name]) { log('error', 'store.reload: "' + name + '" is not defined.'); return undefined; }
                if (timers[name]) { clearTimeout(timers[name]); delete timers[name]; write(name); }
                delete cache[name];
                return this.get(name);
            },
            // For tests / shutdown paths.
            flush: function (name) {
                if (timers[name]) { clearTimeout(timers[name]); delete timers[name]; }
                if (name in cache) write(name);
            }
        };
    }

    if (typeof window !== 'undefined' && window.paqol) {
        if (!paqol.store) {
            paqol.store = createStore(window.localStorage, function (level, m) {
                paqol.log.once('store:' + m.slice(0, 60), level, m);
            }, paqol.MOD_ID);

            // Floating-panel geometry, shared by every scene that reads or
            // resets it: { panels: { <id>: {left,top,width,height,minimized} } }
            paqol.store.define('ui', {
                version: 1,
                defaults: { panels: {} },
                validate: function (d) {
                    var problems = [];
                    if (!d || typeof d !== 'object' || !d.panels || typeof d.panels !== 'object')
                        problems.push('$.panels: expected object');
                    return problems;
                }
            });
        }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { createStore: createStore };
})();
