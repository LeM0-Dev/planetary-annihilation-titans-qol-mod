// PA QoL — notification audio arbiter. Pure ES5, node-testable.
// Decides whether a notification voice line may proceed to the base game's
// own audio queue. Fails OPEN everywhere: unknown or unconfigured events are
// always allowed, and a runaway denial rate trips a circuit breaker that
// bypasses the arbiter for the rest of the session.
var paqolAudioArbiter = (function () {
    'use strict';

    var BREAKER_MAX_DENIALS = 40;
    var BREAKER_WINDOW_MS = 10000;

    // opts: {
    //   getConfig:   function() -> { eventName: {enabled, priority} }
    //   now:         function() -> ms timestamp
    //   getWindowMs: function() -> stomp-protection window (default 3000,
    //                mirroring the base game's 3 s audio queue slot)
    //   log:         function(level, message)   (optional)
    // }
    function create(opts) {
        var getConfig = opts.getConfig;
        var now = opts.now;
        var getWindowMs = opts.getWindowMs || function () { return 3000; };
        var log = opts.log || function () {};

        var last = null;          // {prio, at} of the last ALLOWED line
        var denials = [];         // timestamps, pruned to the breaker window
        var arbiter = {
            bypass: false,

            // eventName: string name or null/undefined when unresolvable.
            // Returns {allow: bool, why: string}.
            decide: function (eventName) {
                if (arbiter.bypass) return { allow: true, why: 'bypass' };
                if (!eventName) return { allow: true, why: 'unknown-event' };

                var config;
                try { config = getConfig(); } catch (e) { return { allow: true, why: 'config-error' }; }
                if (!config || typeof config !== 'object') return { allow: true, why: 'no-config' };

                var cfg = config[eventName];
                if (!cfg || typeof cfg !== 'object') return { allow: true, why: 'unconfigured' };

                if (cfg.enabled === false) return deny('disabled');

                var prio = cfg.priority;
                if (typeof prio !== 'number' || isNaN(prio)) prio = 3;
                prio = Math.max(0, Math.min(6, Math.floor(prio)));

                var t = now();
                // Stomp protection: a lower-priority line must not consume the
                // base game's queue slot while a higher one is in flight.
                if (last && (t - last.at) < getWindowMs() && prio < last.prio)
                    return deny('outranked');

                last = { prio: prio, at: t };
                return { allow: true, why: 'ok' };
            },

            reset: function () {
                last = null;
                denials.length = 0;
                arbiter.bypass = false;
            }
        };

        function deny(why) {
            var t = now();
            denials.push(t);
            while (denials.length && (t - denials[0]) > BREAKER_WINDOW_MS) denials.shift();
            if (denials.length > BREAKER_MAX_DENIALS) {
                arbiter.bypass = true;
                log('error', 'audio arbiter denied ' + denials.length + ' events in ' +
                    (BREAKER_WINDOW_MS / 1000) + 's; disabling itself for this session (all audio passes through).');
                return { allow: true, why: 'breaker' };
            }
            return { allow: false, why: why };
        }

        return arbiter;
    }

    return { create: create };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = paqolAudioArbiter;
