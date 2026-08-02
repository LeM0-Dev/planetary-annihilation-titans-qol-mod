// PA QoL — notification audio enable/priority control. ES5 only.
//
// Lever 1: wrap audioModel.processEvent — the single universal choke point
//   (events.js funnels every notification into it). Disabled events are
//   dropped; a lower-priority line arriving inside the stomp window while a
//   higher one is in flight is dropped. Everything else passes through to the
//   base game's own queue/priority machinery untouched.
// Lever 2: wrap api.audio.playSoundAtLocation — learn which cue belongs to
//   which event while lever 1 is delegating, and drop a *later-queued* cue
//   positively known to belong to an event the user disabled. Never touches
//   api.audio.playSound (UI click/rollover sounds).
//
// Registered in BOTH live_game and live_game_unit_alert: each scene loads its
// own copy of js/audio.js, i.e. two independent audioModel closures.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'notify_priority',
        scenes: ['live_game', 'live_game_unit_alert'],
        requires: ['audioModel.processEvent', 'api.audio.playSoundAtLocation', '_'],
        init: function () {
            var CONFIG_REFRESH_MS = 2000;
            var CUE_CAP = 200;

            var lastConfigLoad = 0;

            // The in-game settings panel is a separate page sharing the same
            // localStorage, so re-read config at most every 2 s.
            function refreshedStore(name) {
                var now = _.now();
                if (now - lastConfigLoad > CONFIG_REFRESH_MS) {
                    lastConfigLoad = now;
                    paqol.store.reload('notifications');
                    paqol.store.reload('prefs');
                    publishDecay();
                }
                return paqol.store.get(name);
            }

            // The shadowed js/audio.js reads paqol.audioDecayMs lazily for
            // its priority decay (vanilla hardcodes 30 s).
            function publishDecay() {
                var prefs = paqol.store.get('prefs');
                paqol.audioDecayMs = (prefs && typeof prefs.audioDecayMs === 'number')
                    ? prefs.audioDecayMs : 3000;
            }
            publishDecay();

            var arbiter = paqolAudioArbiter.create({
                getConfig: function () { return refreshedStore('notifications'); },
                now: function () { return _.now(); },
                getWindowMs: function () {
                    var prefs = paqol.store.get('prefs');
                    return (prefs && typeof prefs.arbiterWindowMs === 'number') ? prefs.arbiterWindowMs : 3000;
                },
                log: function (level, m) { paqol.log.once('arbiter-breaker', level, m); }
            });
            paqol.arbiter = arbiter; // console access for manual testing

            var pendingEvent = null;

            paqol.safeWrap(window.audioModel, 'processEvent', function (callOriginal, args) {
                var name = paqol.pa.eventName(args[0]);
                var decision = arbiter.decide(name);
                if (!decision.allow) return undefined; // original returns void
                pendingEvent = name;
                try {
                    return callOriginal();
                } finally {
                    pendingEvent = null;
                }
            }, 'audioModel.processEvent');

            paqol.safeWrap(api.audio, 'playSoundAtLocation', function (callOriginal, args) {
                var cue = args[0];
                if (typeof cue === 'string' && cue) {
                    if (pendingEvent) {
                        learnCue(cue, pendingEvent);
                    } else if (isDisabledCue(cue)) {
                        // Cue popped out of the base game's deferred 3 s queue
                        // for an event the user has disabled.
                        return undefined;
                    }
                }
                return callOriginal();
            }, 'api.audio.playSoundAtLocation');

            function learnCue(cue, eventName) {
                var map = paqol.store.get('cuemap');
                if (!map || !map.cues) return;
                if (map.cues[cue] === eventName) return;
                if (map.cues[cue] === undefined && _.size(map.cues) >= CUE_CAP) return;
                map.cues[cue] = eventName;
                paqol.store.set('cuemap', map);
            }

            function isDisabledCue(cue) {
                var map = paqol.store.get('cuemap');
                var eventName = map && map.cues && map.cues[cue];
                if (!eventName) return false; // never suppress an unlearned cue
                var cfg = refreshedStore('notifications');
                var entry = cfg && cfg[eventName];
                return !!(entry && entry.enabled === false);
            }
        }
    });
})();
