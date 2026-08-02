// PA QoL — high-value-target classification. Pure ES5, node-testable.
// Re-implements the base game's unit_types bit test locally (see
// media/ui/main/game/live_game/js/events.js:8-14) so this module has zero
// dependency on `constants`/`eventSystem` and runs under node --test.
var paqolHvt = (function () {
    'use strict';

    // Bit indices verified against live_game/js/constants.js (build 124667).
    var BITS = {
        Commander: 0,
        SupportCommander: 1, // Colonel
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
    // Ranks order the target window: commander-role units first (some
    // enemies field Colonels/Angels in a commander-like role).
    var CATEGORIES = [
        { key: 'commander', bit: BITS.Commander, label: '!LOC:Commander', rank: 0 },
        { key: 'colonel', bit: BITS.SupportCommander, label: '!LOC:Colonel', rank: 1 },
        { key: 'titan', bit: BITS.Titan, label: '!LOC:Titan', rank: 3 },
        { key: 'nuke', bit: BITS.Nuke, label: '!LOC:Nuke Launcher', rank: 4 },
        { key: 'antinuke', bit: BITS.NukeDefense, label: '!LOC:Anti-Nuke', rank: 5 },
        { key: 'catalyst', bit: BITS.ControlModule, label: '!LOC:Catalyst', rank: 7 },
        { key: 'halley', bit: BITS.PlanetEngine, label: '!LOC:Halley', rank: 8 },
        { key: 'teleporter', bit: BITS.Teleporter, label: '!LOC:Teleporter', rank: 9 }
    ];

    // No dedicated unit_type bit exists for these; the base game itself
    // path-matches spec ids (live_game_unit_alert.js:469 for the unit
    // cannon). The Angel (support_platform) only carries generic tags.
    var PATH_CATEGORIES = [
        { re: /unit_cannon/, key: 'unit_cannon', label: '!LOC:Unit Cannon', rank: 6 },
        { re: /support_platform/, key: 'angel', label: '!LOC:Angel', rank: 2 }
    ];

    function classify(unitTypes, specId) {
        var i;
        if (typeof specId === 'string') {
            for (i = 0; i < PATH_CATEGORIES.length; i++) {
                var p = PATH_CATEGORIES[i];
                if (p.re.test(specId))
                    return { key: p.key, label: p.label, rank: p.rank };
            }
        }
        if (!unitTypes || typeof unitTypes.length !== 'number' || unitTypes.length < 4)
            return null;
        for (i = 0; i < CATEGORIES.length; i++) {
            var c = CATEGORIES[i];
            if (isType(c.bit, unitTypes))
                return { key: c.key, label: c.label, rank: c.rank };
        }
        return null;
    }

    return { classify: classify, isType: isType, BITS: BITS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = paqolHvt;
