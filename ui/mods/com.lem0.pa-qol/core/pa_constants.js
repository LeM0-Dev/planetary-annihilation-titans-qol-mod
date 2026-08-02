// PA QoL — reverse lookups over the base game's `constants` global. ES5 only.
// `constants` is a mutable global (live_game/js/constants.js) that other mods
// may append event types to, so the reverse map is rebuilt whenever its size
// changes. In scenes without constants (e.g. settings) every lookup returns
// null and callers treat that as "unknown" (which fails open downstream).
(function () {
    'use strict';
    if (paqol.pa) return;

    var eventNameById = null;
    var builtFromSize = -1;

    function rebuild() {
        var src = window.constants && constants.event_type;
        if (!src || typeof src !== 'object') { eventNameById = null; return; }
        var size = _.size(src);
        if (eventNameById && size === builtFromSize) return;
        eventNameById = {};
        for (var name in src) {
            if (!Object.prototype.hasOwnProperty.call(src, name)) continue;
            eventNameById[src[name]] = name;
        }
        builtFromSize = size;
    }

    paqol.pa = {
        // number -> 'commander_under_attack' | null.
        // Note constants.event_type includes the 15 watch_type names at 0-14.
        eventName: function (id) {
            rebuild();
            if (!eventNameById) return null;
            var name = eventNameById[id];
            return name === undefined ? null : name;
        },
        watchType: function (name) {
            if (!window.constants || !constants.watch_type) return null;
            var v = constants.watch_type[name];
            return v === undefined ? null : v;
        }
    };
})();
