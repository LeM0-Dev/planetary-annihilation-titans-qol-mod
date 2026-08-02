// PA:T QoL — armory acquisition info. ES5 only.
//
// The PlayFab catalog says WHETHER a commander is locked (NotForSale, not
// owned) but carries no acquisition path — UnlocksWith/DropTags ship empty.
// This feature annotates locked commanders whose acquisition is community
// knowledge with a "?" badge next to the Locked label; hovering it shows how
// the commander is obtained. Locked commanders with no known path get no
// badge rather than a guess.
//
// Injection runs BEFORE ko.applyBindings (armory.js:739 vs :746), so the
// badge is added to the tile TEMPLATE inside the #commander-list foreach and
// binds like native markup.
(function () {
    'use strict';

    // ObjectName -> how it is obtained. Sources: community knowledge
    // (tournaments/PTE/ranked) and documented Kickstarter reward tiers.
    var ACQUISITION = {
        // tournaments
        QuadCalyx: 'Awarded for playing in community tournaments.',
        GammaCommander: 'Awarded for playing in community tournaments.',
        QuadAjax: 'Awarded for playing in community tournaments.',
        // test builds
        ImperialKapowaz: 'Awarded for consistently participating in PTE / LABS test builds.',
        // ranked ladder
        RaptorBeast: 'Awarded for finishing #1 at the end of a ranked season.',
        RaptorBeastKing: 'Awarded for finishing #1 in a ranked season AND beating the current holder in a Bo7/Bo9 tournament.',
        // documented Kickstarter reward tiers — no longer obtainable
        AlphaCommander: 'Kickstarter backer reward — no longer obtainable.',
        DeltaCommander: 'Kickstarter backer reward — no longer obtainable.',
        ThetaCommander: 'Kickstarter backer reward — no longer obtainable.',
        ProgenitorCommander: 'Kickstarter backer reward — no longer obtainable.'
    };

    paqol.registry.add({
        id: 'armory_info',
        scenes: ['armory'],
        requires: ['model.commanders', 'model.costForCommander', 'ko', '$'],
        init: function () {
            // Owned splits into: 'Owned' (free or granted exclusives) vs
            // 'Purchased' (buyable item you actually own). PlayFab does not
            // record HOW an item entered the inventory, so buyable+owned is
            // the honest proxy for purchased.
            paqol.safeWrap(model, 'costForCommander', function (callOriginal, args) {
                var r = callOriginal();
                var c = args[0];
                if (r === 'Owned' && c && c.IsOwned && !c.IsFree && !c.NotForSale)
                    return 'Purchased';
                return r;
            }, 'model.costForCommander');

            // How a LOCKED commander is obtained. Unknown ones get an honest
            // fallback rather than silence or a guess.
            model.paqolAcq = function (c) {
                if (!c || model.costForCommander(c) !== 'Locked') return null;
                if (ACQUISITION[c.ObjectName]) return ACQUISITION[c.ObjectName];
                if (c.KSBacker)
                    return 'Personal commander of Kickstarter backer ' + c.KSBacker +
                        ' — no longer obtainable.';
                return 'Obtainability unknown.';
            };

            // One shared tooltip, positioned next to the hovered element.
            var $tip = $('<div id="paqol-acq-tip"></div>').appendTo(document.body).hide();
            model.paqolTipShow = function (text, event) {
                if (!text || !event || !event.target) return;
                var r = event.target.getBoundingClientRect();
                $tip.text(text).css({
                    left: Math.min(r.left, $(window).width() - 340) + 'px',
                    top: (r.bottom + 6) + 'px'
                }).show();
            };
            model.paqolAcqShow = function (data, event) {
                model.paqolTipShow(model.paqolAcq(data), event);
            };
            model.paqolAcqHide = function () { $tip.hide(); };

            // Badge into the tile template's price row (pre-binding, so the
            // foreach clones and binds it per commander).
            var $price = $('#commander-list .div_price');
            if (!paqol.optional($price.length === 1,
                'armory tile template not found (div_price x' + $price.length + ');')) return;
            // keep the stock 'owned' pill styling for the Purchased label
            var $lbl = $price.find('.lbl_price');
            var bind = $lbl.attr('data-bind');
            if (bind && bind.indexOf('lbl_owned') !== -1) {
                $lbl.attr('data-bind', bind.replace(
                    "lbl_owned: (model.costForCommander($data) === 'Owned')",
                    "lbl_owned: (model.costForCommander($data) === 'Owned' || model.costForCommander($data) === 'Purchased')"));
            }

            $price.append(
                '<span class="paqol-acq-badge" data-bind="visible: !!model.paqolAcq($data), ' +
                'event: { mouseenter: function (d, e) { model.paqolAcqShow($data, e); }, ' +
                'mouseleave: model.paqolAcqHide }">?</span>');

            // ---- Badges tab: Obtained / Not obtained -----------------------
            // model.badges is Badges.all filtered to PlayFab-owned; the full
            // catalog is exposed, so the missing ones can be shown too. All
            // six shipped badges are legacy-era grants.
            var BADGE_INFO = {
                AlphaBadge: 'Granted for participating in the PA alpha (2013) — no longer obtainable.',
                BetaBadge: 'Granted for participating in the PA beta — no longer obtainable.',
                KickstarterBadge: 'Granted for backing the 2012 Kickstarter — no longer obtainable.',
                CustomComBadge: 'Granted to Kickstarter backers of the custom-commander tier — no longer obtainable.',
                VIPBadge: 'Granted personally by the developers to VIPs.',
                CosmicBadge: 'PA Founding Commander — granted for early (Cosmic Edition) support; no longer obtainable.'
            };

            if (window.Badges && _.isArray(Badges.all) && window.PlayFab &&
                typeof PlayFab.isItemOwned === 'function') {
                // Same reactive source the stock list uses.
                model.paqolLockedBadges = ko.pureComputed(function () {
                    return _.map(_.filter(Badges.all, function (b) {
                        return !PlayFab.isItemOwned(b.objectName);
                    }), function (b) {
                        return {
                            name: b.name,
                            image: b.image,
                            info: BADGE_INFO[b.objectName] || 'Obtainability unknown.'
                        };
                    });
                });

                var $badges = $('#badges #badge-list');
                if (paqol.optional($badges.length === 1, 'badge list not found;')) {
                    $badges.before('<div class="paqol-badge-heading">Obtained</div>');
                    $badges.after(
                        '<div class="paqol-badge-empty" data-bind="visible: badges().length === 0">None yet.</div>' +
                        '<div class="paqol-badge-heading">Not obtained</div>' +
                        '<div id="paqol-badge-locked" data-bind="foreach: paqolLockedBadges">' +
                        '  <div class="one-badge paqol-badge-locked-tile" ' +
                        '       data-bind="event: { mouseenter: function (d, e) { model.paqolTipShow($data.info, e); }, ' +
                        '       mouseleave: model.paqolAcqHide }">' +
                        '    <div class="one-badge-cont">' +
                        '      <img class="icon" data-bind="attr: { src: $data.image }" />' +
                        '      <div data-bind="text: $data.name"></div>' +
                        '    </div>' +
                        '  </div>' +
                        '</div>' +
                        '<div class="paqol-badge-empty" data-bind="visible: paqolLockedBadges().length === 0">All obtained!</div>');
                }
            } else {
                paqol.log.warn('Badges/PlayFab globals unavailable; badge section skipped.');
            }
        }
    });
})();
