// PA QoL — assumption checks. ES5 only.
// Rule 1: required assumptions throw (inside feature init, where the registry
// catches them); optional ones warn and return false.
(function () {
    'use strict';
    if (paqol.invariant) return;

    paqol.invariant = function (cond, message) {
        if (!cond) throw new Error('[' + paqol.MOD_ID + '] ' + message);
    };

    paqol.optional = function (cond, message) {
        if (!cond) {
            paqol.log.warn(message + ' Feature skipped.');
            return false;
        }
        return true;
    };

    // Resolve a dotted path off window; returns the value or undefined.
    // Used by the registry to probe declared feature requirements.
    paqol.probe = function (path) {
        var parts = String(path).split('.');
        var cur = window;
        for (var i = 0; i < parts.length; i++) {
            if (cur === null || cur === undefined) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    };
})();
