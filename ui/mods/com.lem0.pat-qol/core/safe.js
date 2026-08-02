// PA QoL — safe host-function wrapping. ES5 only.
// Rule 4: verify target, keep the original, preserve this/args/return,
// fall back to the original if the wrapper fails, never patch twice.
//
// NOTE: the safeWrap example in PA-MOD-CODING-RULES.md uses const / rest /
// template literals, which are fatal syntax errors in Coherent (Chrome 40).
// This is the Chrome-40-correct equivalent. See docs/chrome40-house-rules.md.
(function () {
    'use strict';
    if (paqol.safeWrap) return;

    // wrapper is called as wrapper.call(this, callOriginal, args)
    //   callOriginal() -> invokes the original with the captured this/args
    //   args           -> the raw arguments array (read-only by convention)
    paqol.safeWrap = function (target, key, wrapper, tag) {
        tag = tag || key;
        if (!target || typeof target[key] !== 'function') {
            paqol.log.warn('Cannot patch ' + tag + ': not a function. Skipping.');
            return false;
        }
        var mark = '__paqolWrapped_' + key;
        if (target[mark]) {
            paqol.log.warn('Already patched ' + tag + '; skipping second wrap.');
            return false;
        }

        var original = target[key];

        target[key] = function () {
            var args = Array.prototype.slice.call(arguments);
            var self = this;
            var called = false;
            var callOriginal = function () {
                called = true;
                return original.apply(self, args);
            };
            try {
                return wrapper.call(self, callOriginal, args);
            } catch (e) {
                paqol.log.once('wrap:' + tag, 'error',
                    'Wrapper for ' + tag + ' threw; falling back to base-game behaviour.', e);
                // Only fall back if the wrapper died BEFORE delegating,
                // otherwise the original would run twice.
                if (!called) return callOriginal();
                return undefined;
            }
        };
        target[mark] = true;
        return true;
    };
})();
