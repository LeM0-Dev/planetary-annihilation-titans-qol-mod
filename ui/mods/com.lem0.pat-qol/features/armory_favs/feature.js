// PA:T QoL — favorite commanders in the armory. ES5 only.
//
// The game has one built-in preference (default commander). This adds a
// second, cosmetic one: a star on every commander tile toggles it as a
// favorite, and favorites sort to the top of the list. Stored per-user in
// the mod's namespaced localStorage store; survives catalog refreshes (the
// stock sortCommanders rebuild is wrapped to re-apply the partition).
(function () {
    'use strict';

    paqol.registry.add({
        id: 'armory_favs',
        scenes: ['armory'],
        requires: ['model.commanders', 'model.sortCommanders', 'ko', '$'],
        init: function () {
            var useStore = !!(window.paqol && paqol.store);
            if (useStore) {
                paqol.store.define('favorites', {
                    version: 1,
                    defaults: { names: [] },
                    validate: function (d) {
                        var problems = [];
                        if (!d || !_.isArray(d.names)) problems.push('$.names: expected array');
                        return problems;
                    }
                });
            } else {
                paqol.log.warn('favorites: store unavailable; stars will not persist.');
            }

            var favSet = {};
            if (useStore) {
                var saved = paqol.store.get('favorites');
                _.forEach((saved && saved.names) || [], function (n) { favSet[n] = true; });
            }
            var favRev = ko.observable(0); // bumps so bindings re-evaluate

            function persist() {
                if (useStore) paqol.store.set('favorites', { names: _.keys(favSet) });
            }

            model.paqolIsFav = function (c) {
                favRev();
                return !!(c && favSet[c.ObjectName]);
            };

            // Stable partition: favorites first, stock order preserved within
            // both halves. Selection is index-based, so remap it.
            var resorting = false;
            function resort() {
                if (resorting) return;
                resorting = true;
                try {
                    var list = model.commanders();
                    var selName = null;
                    if (typeof model.selectedCommanderIndex === 'function') {
                        var i = model.selectedCommanderIndex();
                        if (i >= 0 && list[i]) selName = list[i].ObjectName;
                    }
                    // current default first, then favorites, then the rest —
                    // stock order preserved within each group
                    var defName = (typeof model.preferredCommanderObjectName === 'function')
                        ? model.preferredCommanderObjectName() : null;
                    var def = [], favs = [], rest = [];
                    _.forEach(list, function (c) {
                        if (defName && c.ObjectName === defName) def.push(c);
                        else if (favSet[c.ObjectName]) favs.push(c);
                        else rest.push(c);
                    });
                    // always set (fresh array notifies) — unfavoriting the
                    // last favorite must still restore the stock order
                    var next = def.concat(favs).concat(rest);
                    model.commanders(next);
                    if (selName !== null) {
                        var ni = -1;
                        _.forEach(next, function (c, j) {
                            if (ni === -1 && c.ObjectName === selName) ni = j;
                        });
                        model.selectedCommanderIndex(ni);
                    }
                } finally { resorting = false; }
            }

            model.paqolToggleFav = function (c) {
                if (!c || !c.ObjectName) return;
                if (favSet[c.ObjectName]) delete favSet[c.ObjectName];
                else favSet[c.ObjectName] = true;
                persist();
                favRev(favRev() + 1);
                resort();
            };

            // Set/clear the default straight from a tile. Mirrors the stock
            // selectCommander body (armory.js:295-308) without the
            // selection-index indirection.
            model.paqolSetDefault = function (c) {
                if (!c || !(c.IsOwned || c.IsFree)) return;
                if (!window.CommanderUtility || !CommanderUtility.byObjectName) return;
                model.preferredCommander(CommanderUtility.byObjectName.getSpecPath(c.ObjectName));
                if (typeof model.hasEverSelectedCommander === 'function')
                    model.hasEverSelectedCommander(true);
            };
            model.paqolClearDefault = function () {
                model.preferredCommander(null);
                if (typeof model.hasEverSelectedCommander === 'function')
                    model.hasEverSelectedCommander(false);
            };

            // The stock list rebuild (catalog load, inventory refresh) ends
            // in sortCommanders — re-apply the partition after it; also
            // re-apply when the default changes.
            paqol.safeWrap(model, 'sortCommanders', function (callOriginal) {
                var r = callOriginal();
                resort();
                return r;
            }, 'model.sortCommanders');
            if (model.preferredCommanderObjectName &&
                typeof model.preferredCommanderObjectName.subscribe === 'function')
                model.preferredCommanderObjectName.subscribe(resort);
            resort(); // in case the list is already populated

            // Star into the tile template's TITLE band, top right — same
            // row as the commander name, sized like it.
            var $title = $('#commander-list .commander-title-grp');
            if (!paqol.optional($title.length === 1,
                'commander title template not found (title-grp x' + $title.length + ');')) return;
            $title.append(
                '<span class="paqol-fav-star" data-bind="css: { \'paqol-fav-on\': model.paqolIsFav($data) }, ' +
                'click: function (d, e) { model.paqolToggleFav($data); }, clickBubble: false, ' +
                'attr: { title: model.paqolIsFav($data) ? \'Unfavorite\' : \'Favorite\' }, ' +
                'click_sound: \'default\'">★</span>');

            // Default-commander mark: replace the stock star overlay with a
            // DEFAULT pill in the price row — the slot the Add-to-cart
            // button uses on buyable tiles (the default is always owned, so
            // the two never collide). Same reactive source as the stock
            // mark (preferredCommanderObjectName).
            $('#commander-list .commander-selected').remove();
            var $price = $('#commander-list .div_price');
            if (paqol.optional($price.length === 1,
                'price row template not found (div_price x' + $price.length + ');')) {
                // same placement as the cart button: siblings right after the
                // floated .div_price, filling the SAME row — left edge up to
                // the Owned/Purchased label. DEFAULT on the current default
                // (click clears it — replaces the stock reset), SET DEFAULT
                // on every other usable commander.
                $price.after(
                    '<span class="paqol-default-pill" data-bind="visible: ' +
                    '$data.ObjectName == model.preferredCommanderObjectName(), ' +
                    'click: model.paqolClearDefault, clickBubble: false, click_sound: \'default\', ' +
                    'attr: { title: \'Click to clear the default\' }">DEFAULT</span>' +
                    '<span class="paqol-setdefault" data-bind="visible: ' +
                    '($data.IsOwned || $data.IsFree) && $data.ObjectName != model.preferredCommanderObjectName(), ' +
                    'click: function (d, e) { model.paqolSetDefault($data); }, clickBubble: false, ' +
                    'click_sound: \'default\'">SET DEFAULT</span>');

                // stock footer Set-As-Default button is redundant now
                $('.div_commit_cont .btn_std').filter(function () {
                    return ($(this).attr('data-bind') || '').indexOf('$root.selectCommander') !== -1;
                }).remove();
            }
        }
    });
})();
