// PA QoL — namespaced logger. ES5 only.
// Rule 8: every message carries the mod id; repeatable failures are logged once.
(function () {
    'use strict';
    if (paqol.log) return;

    var seen = {};

    function fmt(m) { return '[' + paqol.MOD_ID + '] ' + m; }

    paqol.log = {
        info: function (m) { console.log(fmt(m)); },
        warn: function (m, e) {
            if (e !== undefined) console.warn(fmt(m), e);
            else console.warn(fmt(m));
        },
        error: function (m, e) {
            if (e !== undefined) console.error(fmt(m), e);
            else console.error(fmt(m));
        },
        // Log a given key at most once per page lifetime (no per-tick spam).
        once: function (key, level, m, e) {
            if (seen[key]) return;
            seen[key] = true;
            paqol.log[level](m + ' (further occurrences suppressed)', e);
        }
    };
})();
