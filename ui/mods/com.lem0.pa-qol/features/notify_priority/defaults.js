// PA QoL — notification defaults + store definitions. ES5 only.
// Loaded in every scene that touches config (live_game, live_game_unit_alert,
// settings), so all three stores are defined here, once.
//
// Event names must match constants.event_type keys (live_game/js/constants.js,
// build 124667). Watch-type names (ready/death/allied_death/projectile) are
// included because the alert panel forwards alert.watch_type into the same
// audio pipeline. Unknown/unlisted events always FAIL OPEN in the arbiter.
(function () {
    'use strict';
    if (window.paqolNotifyDefaults) return;

    // [key, title, defaultPriority(0-6), defaultEnabled]
    var GROUPS = [
        {
            title: '!LOC:Commander',
            items: [
                ['commander_under_attack', '!LOC:Commander under attack', 5, true],
                ['commander_low_health', '!LOC:Commander low health', 6, true],
                ['commander_under_attack_very_low_health', '!LOC:Commander critical', 6, true],
                ['commander_healed', '!LOC:Commander healed', 2, true],
                ['commander_destroyed', '!LOC:Commander destroyed', 6, true],
                ['commander_arrival', '!LOC:Commander arrival', 3, true],
                ['allied_commander_under_attack', '!LOC:Allied commander under attack', 4, true],
                ['allied_commander_low_health', '!LOC:Allied commander low health', 4, true],
                ['allied_commander_destroyed', '!LOC:Allied commander destroyed', 5, true],
                ['enemy_commander_sighted', '!LOC:Enemy commander sighted', 3, true],
                ['enemy_commander_under_attack', '!LOC:Enemy commander under attack', 2, true],
                ['enemy_commander_low_health', '!LOC:Enemy commander low health', 3, true],
                ['enemy_commander_destroyed', '!LOC:Enemy commander destroyed', 4, true],
                ['enemy_commander_departure', '!LOC:Enemy commander leaving', 2, true]
            ]
        },
        {
            title: '!LOC:Economy',
            items: [
                ['low_metal', '!LOC:Low metal', 2, true],
                ['low_energy', '!LOC:Low energy', 3, true],
                ['full_metal', '!LOC:Metal storage full', 1, true],
                ['full_energy', '!LOC:Energy storage full', 1, true],
                ['metal_lost', '!LOC:Metal lost', 1, true],
                ['enemy_metal_destroyed', '!LOC:Enemy metal destroyed', 1, true],
                ['construction_continuous_on', '!LOC:Continuous build on', 1, true],
                ['construction_continuous_off', '!LOC:Continuous build off', 1, true]
            ]
        },
        {
            title: '!LOC:Combat',
            items: [
                ['under_attack', '!LOC:Units under attack', 3, true],
                ['in_combat', '!LOC:In combat', 2, true],
                ['new_enemy_contact', '!LOC:New enemy contact', 3, true],
                ['ready', '!LOC:Unit ready', 1, true],
                ['death', '!LOC:Unit lost', 1, true],
                ['allied_death', '!LOC:Allied unit lost', 1, true],
                ['projectile', '!LOC:Launch detected (nuke etc.)', 5, true]
            ]
        },
        {
            title: '!LOC:Special weapons & structures',
            items: [
                ['nuke_ready', '!LOC:Nuke ready', 4, true],
                ['anti_nuke_ready', '!LOC:Anti-nuke ready', 4, true],
                ['unitcannon_full', '!LOC:Unit cannon loaded', 4, true],
                ['ragnarok_loaded', '!LOC:Ragnarok loaded', 5, true],
                ['teleporter_linked', '!LOC:Teleporter linked', 2, true],
                ['transport_arrival', '!LOC:Transport arrival', 2, true],
                ['unit_energy_shutdown', '!LOC:Unit power shutdown', 2, true],
                ['unit_energy_startup', '!LOC:Unit power restored', 1, true]
            ]
        },
        {
            title: '!LOC:Celestial',
            items: [
                ['asteroid_incoming', '!LOC:Planet collision incoming', 5, true],
                ['asteroid_imminent', '!LOC:Planet collision imminent', 6, true],
                ['asteroid_impact', '!LOC:Planet impact', 5, true],
                ['asteroid_respawned', '!LOC:Asteroid respawned', 3, true],
                ['thrust_control_established', '!LOC:Thrust control established', 3, true],
                ['weapon_control_established', '!LOC:Weapon control established', 3, true]
            ]
        },
        {
            title: '!LOC:Bounties',
            items: [
                ['bounty_recieved', '!LOC:Bounty received', 2, true],
                ['bounty_claimed_ally', '!LOC:Bounty claimed (ally)', 2, true],
                ['bounty_claimed_enemy', '!LOC:Bounty claimed (enemy)', 2, true]
            ]
        }
    ];

    // Enemy target window categories. Keys MUST match paqolHvt.classify keys.
    // Colonels and Angels sit right under Commanders: some enemies (notably
    // GW AI factions) field them in a commander-like role.
    var HVT_TARGETS = [
        ['commander', '!LOC:Commanders'],
        ['colonel', '!LOC:Colonels (support commanders)'],
        ['angel', '!LOC:Angels (support platforms)'],
        ['titan', '!LOC:Titans'],
        ['nuke', '!LOC:Nuke launchers'],
        ['antinuke', '!LOC:Anti-nuke launchers'],
        ['unit_cannon', '!LOC:Unit cannons'],
        ['catalyst', '!LOC:Catalysts'],
        ['halley', '!LOC:Halleys'],
        ['teleporter', '!LOC:Teleporters']
    ];

    window.paqolNotifyDefaults = {
        groups: function () { return GROUPS; },
        hvtTargets: function () { return HVT_TARGETS; },
        buildHvtTargets: function () {
            var out = {};
            for (var i = 0; i < HVT_TARGETS.length; i++) out[HVT_TARGETS[i][0]] = true;
            return out;
        },
        // -> { eventName: {enabled, priority} }
        build: function () {
            var out = {};
            for (var g = 0; g < GROUPS.length; g++) {
                var items = GROUPS[g].items;
                for (var i = 0; i < items.length; i++)
                    out[items[i][0]] = { enabled: items[i][3], priority: items[i][2] };
            }
            return out;
        }
    };

    // ---- store definitions (shared by all scenes) ----
    if (window.paqol && paqol.store) {
        paqol.store.define('notifications', {
            version: 1,
            defaults: paqolNotifyDefaults.build(),
            validate: function (d) {
                return paqolSchema.check(d, paqolSchema.mapOf({
                    enabled: paqolSchema.bool,
                    priority: paqolSchema.intRange(0, 6)
                }));
            }
        });

        paqol.store.define('prefs', {
            version: 4,
            defaults: {
                historyEnabled: true,
                historyCap: 300,
                hvtEnabled: true,
                hvtTargets: window.paqolNotifyDefaults.buildHvtTargets(),
                arbiterWindowMs: 3000,
                audioDecayMs: 3000
            },
            migrate: function (fromVersion, data) {
                // v1 had a single hvtWidenWatchlist toggle covering the three
                // categories that need widened engine watch lists; carry that
                // choice into the per-category toggles.
                if (fromVersion === 1) {
                    data = data || {};
                    var widen = data.hvtWidenWatchlist !== false;
                    data.hvtTargets = window.paqolNotifyDefaults.buildHvtTargets();
                    data.hvtTargets.catalyst = widen;
                    data.hvtTargets.halley = widen;
                    data.hvtTargets.teleporter = widen;
                    delete data.hvtWidenWatchlist;
                    fromVersion = 2;
                }
                // v3 adds the voice priority decay (vanilla hardcodes 30 s).
                if (fromVersion === 2) {
                    data = data || {};
                    data.audioDecayMs = 3000;
                    fromVersion = 3;
                }
                // v4 adds the Colonel and Angel target categories.
                if (fromVersion === 3) {
                    data = data || {};
                    if (!data.hvtTargets) data.hvtTargets = window.paqolNotifyDefaults.buildHvtTargets();
                    if (data.hvtTargets.colonel === undefined) data.hvtTargets.colonel = true;
                    if (data.hvtTargets.angel === undefined) data.hvtTargets.angel = true;
                    fromVersion = 4;
                }
                return { version: fromVersion, data: data };
            },
            validate: function (d) {
                var targetShape = {};
                for (var i = 0; i < HVT_TARGETS.length; i++)
                    targetShape[HVT_TARGETS[i][0]] = paqolSchema.bool;
                return paqolSchema.check(d, paqolSchema.object({
                    historyEnabled: paqolSchema.bool,
                    historyCap: paqolSchema.intRange(50, 2000),
                    hvtEnabled: paqolSchema.bool,
                    hvtTargets: paqolSchema.object(targetShape),
                    arbiterWindowMs: paqolSchema.intRange(500, 15000),
                    audioDecayMs: paqolSchema.intRange(500, 60000)
                }));
            }
        });

        // Learned cue -> event-name map (lever 2 of the audio arbiter).
        paqol.store.define('cuemap', {
            version: 1,
            defaults: { cues: {} },
            validate: function (d) {
                var problems = [];
                if (!d || typeof d !== 'object' || !d.cues || typeof d.cues !== 'object') {
                    problems.push('$.cues: expected object');
                    return problems;
                }
                var n = 0;
                for (var k in d.cues) {
                    if (!Object.prototype.hasOwnProperty.call(d.cues, k)) continue;
                    n++;
                    if (typeof d.cues[k] !== 'string') problems.push('$.cues.' + k + ': expected string');
                }
                if (n > 250) problems.push('$.cues: too many entries (' + n + ')');
                return problems;
            }
        });
    }
})();
