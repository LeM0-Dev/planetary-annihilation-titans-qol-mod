// PA:T QoL — favorite commanders in the game lobby (skirmish/MP). ES5 only.
//
// Same treatment as the armory and GW setup: the lobby's commander picker
// grid sorts default-first, favorites next, rest after — and every tile
// gets a toggle star writing the same shared store.
//
// Lobby mechanics (new_game.js:610-665): model.commanders is spec-path
// strings; tiles pick by INDEX into that array (setCommander($index())),
// and selectedCommanderIndex is index-based (-1 = use preferred) — so a
// resort must remap a live selection to keep it on the same commander.
// Setting the index observable directly does NOT resend update_commander
// (only setCommander does), and selectedCommander is a computed whose
// value doesn't change under the remap.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'lobby_favs',
        scenes: ['new_game'],
        requires: ['model.commanders', 'model.setCommander', 'CommanderUtility.bySpec', 'ko', '$'],
        init: function () {
            var favSet = {};
            if (window.paqol && paqol.store) {
                paqol.store.define('favorites', {
                    version: 1,
                    defaults: { names: [] },
                    validate: function (d) {
                        var problems = [];
                        if (!d || !_.isArray(d.names)) problems.push('$.names: expected array');
                        return problems;
                    }
                });
                var saved = paqol.store.get('favorites');
                _.forEach((saved && saved.names) || [], function (n) { favSet[n] = true; });
            } else {
                paqol.log.warn('lobby favorites: store unavailable; skipping.');
            }

            var favRev = ko.observable(0);

            function persist() {
                if (window.paqol && paqol.store)
                    paqol.store.set('favorites', { names: _.keys(favSet) });
            }

            model.paqolLobbyIsFav = function (spec) {
                favRev();
                if (!spec) return false;
                var name = CommanderUtility.bySpec.getObjectName(spec);
                return !!(name && favSet[name]);
            };

            // Default commander: the lobby's own observable (may hold a
            // legacy {UnitSpec} object, per selectedCommander's handling).
            function defaultSpec() {
                if (typeof model.preferredCommander !== 'function') return null;
                var pc = model.preferredCommander();
                if (pc && _.has(pc, 'UnitSpec')) return pc.UnitSpec;
                return pc || null;
            }

            var resorting = false;
            function resort() {
                if (resorting) return;
                resorting = true;
                try {
                    var list = model.commanders();
                    if (!_.isArray(list) || !list.length) return;
                    var selSpec = null;
                    if (typeof model.selectedCommanderIndex === 'function') {
                        var i = model.selectedCommanderIndex();
                        if (i >= 0 && list[i]) selSpec = list[i];
                    }
                    var defSpec = defaultSpec();
                    var def = [], favs = [], rest = [];
                    _.forEach(list, function (s) {
                        if (defSpec && s === defSpec) def.push(s);
                        else if (model.paqolLobbyIsFav(s)) favs.push(s);
                        else rest.push(s);
                    });
                    // always set (fresh array notifies) — unfavoriting the
                    // last favorite must still re-render and restore order
                    var next = def.concat(favs).concat(rest);
                    model.commanders(next);
                    if (selSpec !== null) {
                        var ni = -1;
                        _.forEach(next, function (s, j) {
                            if (ni === -1 && s === selSpec) ni = j;
                        });
                        if (ni !== -1) model.selectedCommanderIndex(ni);
                    }
                } finally { resorting = false; }
            }

            model.paqolLobbyToggleFav = function (spec) {
                var name = spec && CommanderUtility.bySpec.getObjectName(spec);
                if (!name) return;
                if (favSet[name]) delete favSet[name];
                else favSet[name] = true;
                persist();
                favRev(favRev() + 1);
                resort();
            };

            if (typeof model.commanders.subscribe === 'function')
                model.commanders.subscribe(resort); // list is built async
            resort();

            // Toggle star into the HUMAN picker's tile template (the AI
            // picker at #ai-commander-picker shares the item class — scope
            // to #commander-picker).
            var $item = $('#commander-picker .div-commander-picker-item');
            if (!paqol.optional($item.length === 1,
                'lobby commander picker not found (x' + $item.length + ');')) return;
            $item.append(
                '<span class="paqol-lobby-fav-star" data-bind="css: { \'paqol-fav-on\': model.paqolLobbyIsFav($data) }, ' +
                'click: function (d, e) { model.paqolLobbyToggleFav($data); }, clickBubble: false, ' +
                'attr: { title: model.paqolLobbyIsFav($data) ? \'Unfavorite\' : \'Favorite\' }, ' +
                'click_sound: \'default\'">★</span>');
        }
    });
})();
