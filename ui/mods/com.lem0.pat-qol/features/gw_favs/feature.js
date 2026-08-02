// PA:T QoL — favorite commanders in the Galactic War setup. ES5 only.
//
// GW setup auto-selects the default commander but lets you switch. This
// feature reads the favorites saved in the Armory (shared localStorage
// store) and sorts them to the FRONT of model.commanders, so they lead
// both the GW-AI-Overhaul commander-picker modal and the stock
// prev/next carousel (which walks the same array). When the Overhaul's
// picker grid is present, favorite tiles also get a gold star.
//
// model.commanders here is an array of SPEC PATHS, not catalog objects —
// favorites store ObjectNames, so CommanderUtility maps between the two.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'gw_favs',
        scenes: ['gw_start'],
        requires: ['model.commanders', 'CommanderUtility.bySpec', 'ko', '$'],
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
                paqol.log.warn('gw favorites: store unavailable; skipping.');
            }

            var favRev = ko.observable(0); // bumps so bindings re-evaluate

            function persist() {
                if (window.paqol && paqol.store)
                    paqol.store.set('favorites', { names: _.keys(favSet) });
            }

            model.paqolGwIsFav = function (spec) {
                favRev();
                if (!spec) return false;
                var name = CommanderUtility.bySpec.getObjectName(spec);
                return !!(name && favSet[name]);
            };

            // Same order as the armory: current default first, then
            // favorites, then the rest — stock order kept within groups.
            // The default lives in the armory's ko-local storage key (a
            // JSON-encoded spec path); this scene has no observable for it,
            // so read it once (it cannot change while GW setup is open).
            var defSpec = null;
            try { defSpec = JSON.parse(localStorage.getItem('preferredCommander_v2') || 'null'); }
            catch (e) { defSpec = null; }

            // Selection is by VALUE (spec string) in this scene, so no
            // remapping is needed after a resort.
            var resorting = false;
            function resort() {
                if (resorting) return;
                resorting = true;
                try {
                    var list = model.commanders();
                    if (!_.isArray(list) || !list.length) return;
                    var def = [], favs = [], rest = [];
                    _.forEach(list, function (s) {
                        if (defSpec && s === defSpec) def.push(s);
                        else if (model.paqolGwIsFav(s)) favs.push(s);
                        else rest.push(s);
                    });
                    // always set (fresh array notifies) — a toggle must
                    // re-render the grid even when no favorites remain
                    model.commanders(def.concat(favs).concat(rest));
                } finally { resorting = false; }
            }
            if (typeof model.commanders.subscribe === 'function')
                model.commanders.subscribe(resort); // list is built async
            resort();

            // Toggle the CURRENTLY SHOWN commander (stock carousel star).
            // Writes the same store the armory reads, then re-sorts.
            model.paqolGwToggleFav = function () {
                var spec = model.selectedCommander();
                if (!spec) return;
                var name = CommanderUtility.bySpec.getObjectName(spec);
                if (!name) return;
                if (favSet[name]) delete favSet[name];
                else favSet[name] = true;
                persist();
                favRev(favRev() + 1);
                resort();
            };

            // GW-AI-Overhaul's picker grid: GWO builds it from ITS scene
            // script, which may run after this one — so the grid cannot be
            // template-edited here. Decorate the RENDERED tiles instead
            // (manual spans + handlers, no ko), re-decorating whenever the
            // list re-renders (commanders replace) or the modal opens.
            // Toggling works here too — GWO removes the stock carousel, so
            // the grid is the only place to (un)favorite in this mode.
            function decorateGwo() {
                var $items = $('.gwo-commander-picker-item');
                if (!$items.length) return;
                $('.paqol-gw-fav-star').remove();
                var list = model.commanders();
                $items.each(function (i) {
                    var spec = list[i];
                    if (!spec) return;
                    var $s = $('<span class="paqol-gw-fav-star">★</span>');
                    if (model.paqolGwIsFav(spec)) $s.addClass('paqol-fav-on');
                    $s.on('click', function (e) {
                        e.stopPropagation();
                        var name = CommanderUtility.bySpec.getObjectName(spec);
                        if (!name) return;
                        if (favSet[name]) delete favSet[name];
                        else favSet[name] = true;
                        persist();
                        favRev(favRev() + 1);
                        resort(); // re-render + redecorate via subscription
                    });
                    $(this).append($s);
                });
            }
            function kickDecorate() { setTimeout(decorateGwo, 50); }
            if (typeof model.commanders.subscribe === 'function')
                model.commanders.subscribe(kickDecorate);
            if (typeof model.gwoCommanderModalVisible === 'function' &&
                typeof model.gwoCommanderModalVisible.subscribe === 'function')
                model.gwoCommanderModalVisible.subscribe(kickDecorate);
            kickDecorate();

            // Stock carousel, when present: a toggle star centered between
            // the prev/next arrows for the commander on display.
            var $sel = $('#commander-select');
            if (paqol.optional($sel.length === 1,
                'stock commander carousel not found (x' + $sel.length + ');')) {
                $sel.append(
                    '<span id="paqol-gw-carousel-star" data-bind="css: { \'paqol-fav-on\': model.paqolGwIsFav(selectedCommander()) }, ' +
                    'click: model.paqolGwToggleFav, clickBubble: false, ' +
                    'attr: { title: model.paqolGwIsFav(selectedCommander()) ? \'Unfavorite\' : \'Favorite\' }, ' +
                    'click_sound: \'default\'">★</span>');
            }
        }
    });
})();
