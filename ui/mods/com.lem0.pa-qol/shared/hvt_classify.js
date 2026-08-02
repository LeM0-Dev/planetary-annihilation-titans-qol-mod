// PA QoL — high-value-target classification. Pure ES5, node-testable.
// Re-implements the base game's unit_types bit test locally (see
// media/ui/main/game/live_game/js/events.js:8-14) so this module has zero
// dependency on `constants`/`eventSystem` and runs under node --test.
var paqolHvt = (function () {
    'use strict';

    // Bit indices verified against live_game/js/constants.js (build 124667).
    var BITS = {
        Commander: 0,
        Teleporter: 10,
        Nuke: 17,
        NukeDefense: 18,
        ControlModule: 28,   // Catalyst
        PlanetEngine: 29,    // Halley
        Titan: 31
    };

    // Same arithmetic as eventSystem.isType: unit_types is [i32,i32,i32,i32],
    // bit b lives in section [3 - floor(b/32)] at mask 1 << (b % 32).
    function isType(bit, unitTypes) {
        if (!unitTypes || typeof unitTypes.length !== 'number' || unitTypes.length < 4) return false;
        var i = Math.floor(bit / 32);
        var section = unitTypes[3 - i];
        if (typeof section !== 'number' || isNaN(section)) return false;
        return (section & (1 << (bit % 32))) !== 0;
    }

    // Ordered: first match wins. Commander before Titan (commander titans in
    // tutorial content), Titan before Teleporter (Helios has a teleporter
    // block but is tagged LaserPlatform, not Teleporter — belt and braces).
    var CATEGORIES = [
        { key: 'commander', bit: BITS.Commander, label: '!LOC:Commander', rank: 0 },
        { key: 'titan', bit: BITS.Titan, label: '!LOC:Titan', rank: 1 },
        { key: 'nuke', bit: BITS.Nuke, label: '!LOC:Nuke Launcher', rank: 2 },
        { key: 'antinuke', bit: BITS.NukeDefense, label: '!LOC:Anti-Nuke', rank: 3 },
        { key: 'catalyst', bit: BITS.ControlModule, label: '!LOC:Catalyst', rank: 5 },
        { key: 'halley', bit: BITS.PlanetEngine, label: '!LOC:Halley', rank: 6 },
        { key: 'teleporter', bit: BITS.Teleporter, label: '!LOC:Teleporter', rank: 7 }
    ];

    // The unit cannon has no dedicated unit_type bit; the base game itself
    // path-matches the spec id (live_game_unit_alert.js:469). We do the same.
    var UNIT_CANNON = { key: 'unit_cannon', label: '!LOC:Unit Cannon', rank: 4 };

    function classify(unitTypes, specId) {
        if (typeof specId === 'string' && /unit_cannon/.test(specId))
            return { key: UNIT_CANNON.key, label: UNIT_CANNON.label, rank: UNIT_CANNON.rank };
        if (!unitTypes || typeof unitTypes.length !== 'number' || unitTypes.length < 4)
            return null;
        for (var i = 0; i < CATEGORIES.length; i++) {
            var c = CATEGORIES[i];
            if (isType(c.bit, unitTypes))
                return { key: c.key, label: c.label, rank: c.rank };
        }
        return null;
    }

    return { classify: classify, isType: isType, BITS: BITS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = paqolHvt;
