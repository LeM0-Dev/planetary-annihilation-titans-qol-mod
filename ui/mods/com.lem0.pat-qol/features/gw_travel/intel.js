// PA:T QoL — Galactic War map intel labels. ES5 only.
//
// Under every reachable, unconquered system the map shows what you would
// be jumping into:
//     Planets: X - Threat: Y     (Y = the AI's econ multiplier)
//     Enemies: Z                 (main AI + its minions + independent foes)
//     Allies: A
// The map is an EaselJS canvas (shared/js/easeljs), so labels are
// createjs.Text children of each star's scaled display container — they
// zoom with the map. Star view models appear once the campaign loads
// (model.galaxy.systems()), after mod injection, so poll briefly.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'gw_intel',
        scenes: ['gw_play'],
        requires: ['ko', '_'],
        init: function () {
            // the in-game Game Info popup (live_game) reads this: the
            // CURRENT star's intel, refreshed while the map is open, so a
            // launched battle always finds its own system's data.
            // Written as a RAW store envelope — this scene does not load
            // core/store.js, and the reader (window page) does.
            function persistIntel(d) {
                try {
                    localStorage.setItem(paqol.MOD_ID + '/gwintel',
                        JSON.stringify({ v: 1, d: d }));
                } catch (e) { /* popup will say no intel */ }
            }

            // ---- threat: GW-AI-Overhaul's own formula, reimplemented ------
            // (section_of_foreign_intelligence.js measureThreat): per-army
            // eco scaled by commander count, extra 0.4/cmdr for foes, halved
            // (or /(eco+1)) with an AI ally, buff multipliers, ×3 guardians.
            function saneEco(e) { return (typeof e === 'number' && e > 0) ? e : 1; }
            function numCommanders(c) {
                return c.bossCommanders || c.commanderCount || 1;
            }
            function ecoOf(c) {
                var eco = saneEco(c.econ_rate);
                var n = numCommanders(c);
                if (n > 1) eco = eco * ((n + 1) / 2);
                return eco;
            }
            var BUFF_MULT = { 0: 1.3, 4: 1.3, 1: 1.2, 2: 1.2, 7: 1.2, 3: 1.1, 6: 1.5 };
            var BUFF_NAME = {
                0: 'cheaper units', 1: 'damage', 2: 'health', 3: 'speed',
                4: 'build speed', 6: 'combat', 7: 'cooldown'
            };
            function threatOf(ai) {
                var total = 0;
                var all = [ai].concat(ai.minions || []).concat(ai.foes || []);
                _.forEach(all, function (c) { total += ecoOf(c); });
                _.forEach(ai.foes || [], function (army) {
                    total += saneEco(army.econ_rate) * 0.4 * (numCommanders(army) - 1);
                });
                if (ai.ally) total /= (ai.ally.econ_rate ? ai.ally.econ_rate + 1 : 2);
                _.forEach(ai.typeOfBuffs || [], function (b) {
                    total *= (BUFF_MULT[b] || 1);
                });
                if (ai.mirrorMode) total *= 3;
                return Math.round(total * 100) / 100;
            }

            function rawIntel(star) {
                var ai = star.ai && star.ai();
                if (!ai) return null;
                var planets = 0, sysName = '';
                try {
                    planets = (star.system().planets || []).length;
                    sysName = String(star.system().display_name || star.system().name || '');
                } catch (e) { }
                var armies = [ai].concat(ai.minions || []).concat(ai.foes || []);
                var names = [];
                var commanders = 0;
                _.forEach(armies, function (c) {
                    var n = numCommanders(c);
                    commanders += n;
                    names.push(c.name + (n > 1 ? ' ×' + n : ''));
                });
                var mods = [];
                if (ai.landAnywhere) mods.push('Land anywhere');
                if (ai.suddenDeath) mods.push('Sudden death');
                if (ai.bountyMode) mods.push('Bounty mode' +
                    (ai.bountyModeValue ? ' (' + ai.bountyModeValue + ')' : ''));
                if (ai.eradicationMode) mods.push('Eradication mode');
                if (ai.mirrorMode) mods.push('Guardians');
                _.forEach(ai.typeOfBuffs || [], function (b) {
                    mods.push('AI buff: ' + (BUFF_NAME[b] || b));
                });
                return {
                    system: sysName,
                    planets: planets,
                    econ: threatOf(ai),
                    enemies: armies.length,
                    commanders: commanders,
                    allies: (ai.ally ? 1 : 0),
                    enemyNames: names,
                    modifiers: mods
                };
            }

            function intelFor(vm) {
                var d = rawIntel(vm.star);
                if (!d) return null;
                return 'Planets: ' + d.planets + ' - Threat: ' + d.econ +
                    '\nEnemies: ' + d.enemies +
                    (d.commanders > d.enemies ? ' (' + d.commanders + ' commanders)' : '') +
                    '\nAllies: ' + d.allies;
            }

            function persistCurrent() {
                if (!window.model || typeof model.currentStar !== 'function' ||
                    typeof model.game !== 'function' || !model.game()) return;
                var star = model.game().galaxy().stars()[model.currentStar()];
                if (!star) return;
                persistIntel(rawIntel(star) || {});
            }

            function decorate(vm) {
                if (vm.paqolIntel) return;
                vm.paqolIntel = true;
                var txt = new createjs.Text('', 'bold 26px Arial', '#ffffff');
                txt.textAlign = 'center';
                txt.y = 130;
                txt.lineHeight = 30;
                txt.shadow = new createjs.Shadow('#000000', 0, 0, 6);
                vm.systemDisplay.addChild(txt);
                ko.computed(function () {
                    // any star whose AI is still alive — conquest clears
                    // star.ai(), so labels persist on enemies you have only
                    // travelled past and vanish once beaten
                    vm.visited(); // re-evaluate on state changes
                    var t = intelFor(vm);
                    txt.visible = !!t;
                    txt.text = t || '';
                });
            }

            // galaxy loads (and can reload) after injection — keep watching,
            // same lifecycle as the travel-speed boost
            setInterval(function () {
                if (!window.model || !model.galaxy || typeof model.galaxy.systems !== 'function') return;
                if (typeof window.createjs === 'undefined') return;
                _.forEach(model.galaxy.systems() || [], decorate);
                persistCurrent();
            }, 1000);
        }
    });
})();
