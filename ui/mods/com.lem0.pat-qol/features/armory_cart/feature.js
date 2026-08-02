// PA:T QoL — armory cart quick-add. ES5 only.
//
// Stock flow forces one full round-trip per commander: select the tile,
// click Add To Cart, get yanked to the cart tab, click back to Commanders.
// This feature adds a small "+" button on every for-sale tile that drops the
// commander straight into the cart with no tab switch — the cart pill's live
// counter is the feedback — and removes the tab yank from the stock
// Add To Cart button too.
//
// Injection runs BEFORE ko.applyBindings (armory.js:739 vs :746), so the
// button is added to the tile TEMPLATE inside the #commander-list foreach
// and binds like native markup.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'armory_cart',
        scenes: ['armory'],
        requires: ['model.commanders', 'model.cart', 'model.addItemToCart',
            'model.costForCommander', 'ko', '$'],
        init: function () {
            // Buyable at all (the button shows for these); in-cart state
            // reads the cart() observable, so bindings re-evaluate on every
            // cart change and the button flips Add <-> Remove live.
            model.paqolBuyable = function (c) {
                return !!c && !c.NotForSale && !c.IsOwned && !c.IsFree;
            };
            model.paqolInCart = function (c) {
                return !!c && _.some(model.cart(), function (e) {
                    return e.Item.ObjectName === c.ObjectName;
                });
            };
            model.paqolCanCart = function (c) {
                return model.paqolBuyable(c) && !model.paqolInCart(c);
            };

            model.paqolCartToggle = function (c) {
                if (!model.paqolBuyable(c)) return;
                if (model.paqolInCart(c)) {
                    var idx = -1;
                    _.forEach(model.cart(), function (e, i) {
                        if (idx === -1 && e.Item.ObjectName === c.ObjectName) idx = i;
                    });
                    if (idx !== -1 && typeof model.removeItemFromCartByIndex === 'function')
                        model.removeItemFromCartByIndex(idx);
                    return;
                }
                // same Steam-overlay guard the stock button applies
                if (typeof model.microTransactionsAvailable === 'function' &&
                    !model.microTransactionsAvailable()) {
                    if (typeof model.steamOverlayDisabled === 'function')
                        model.steamOverlayDisabled();
                    return;
                }
                model.addItemToCart(c.ObjectName, 1);
            };

            // Everything buyable that is not already carted, in one click.
            // Batch: push stock-shaped cart items, then ONE createCart
            // round-trip (per-item addItemToCart would fire one ubernet
            // call each); falls back to the stock per-item path if the
            // batch seams are gone.
            model.paqolHasBuyable = function () {
                return _.some(model.commanders(), model.paqolCanCart);
            };
            model.paqolCartHasItems = function () {
                return model.cart().length > 0;
            };
            // "Buy All Available ($xx.xx)" / "Remove All (n)"
            model.paqolBuyAllLabel = function () {
                if (model.paqolCartHasItems())
                    return 'Remove All (' + model.cart().length + ')';
                var total = 0;
                _.forEach(model.commanders(), function (c) {
                    if (model.paqolCanCart(c) && c.Prices && typeof c.Prices.RM === 'number')
                        total += c.Prices.RM;
                });
                if (total > 0 && typeof model.formatRM === 'function')
                    return 'Buy All Available (' + model.formatRM(total) + ')';
                return 'Buy All Available';
            };
            // "Checkout ($xx.xx)" — stock cartTotalPrice is the cents sum
            // of everything in the cart
            model.paqolCheckoutLabel = function () {
                if (typeof model.cartTotalPrice === 'function' &&
                    typeof model.formatRM === 'function' && model.cartTotalPrice() > 0)
                    return 'Checkout (' + model.formatRM(model.cartTotalPrice()) + ')';
                return 'Checkout';
            };
            // The footer button is a toggle: empty cart -> add everything
            // buyable; anything in the cart -> empty it.
            model.paqolCartAllToggle = function () {
                if (model.paqolCartHasItems()) {
                    model.cart.removeAll();
                    if (typeof model.createCart === 'function') model.createCart();
                    return;
                }
                model.paqolCartAll();
            };
            model.paqolCartAll = function () {
                if (!model.paqolHasBuyable()) return;
                if (typeof model.microTransactionsAvailable === 'function' &&
                    !model.microTransactionsAvailable()) {
                    if (typeof model.steamOverlayDisabled === 'function')
                        model.steamOverlayDisabled();
                    return;
                }
                var batch = typeof model.createCart === 'function' &&
                    window.PlayFab && typeof PlayFab.getCatalogItem === 'function';
                var added = false;
                _.forEach(model.commanders(), function (c) {
                    if (!model.paqolCanCart(c)) return;
                    if (batch) {
                        var item = PlayFab.getCatalogItem(c.ObjectName);
                        if (!item) return;
                        model.cart.push({ Item: item, Quantity: 1 });
                        added = true;
                    } else {
                        model.addItemToCart(c.ObjectName, 1);
                    }
                });
                if (batch && added) model.createCart();
            };

            // The stock detail-pane button jumps to the cart tab on every
            // add ($('a[href="#cart"]').click() inline in armory.js:631) —
            // there is nothing to wrap AROUND, so this is a replacement that
            // mirrors the original body minus the jump. If the expected
            // members are gone (PA patch), fall through to the original.
            paqol.safeWrap(model, 'addCart', function (callOriginal) {
                if (typeof model.selectedIsNotForSale !== 'function' ||
                    typeof model.selectedCommanderIndex !== 'function' ||
                    typeof model.microTransactionsAvailable !== 'function')
                    return callOriginal();
                if (model.selectedIsNotForSale()) return;
                if (!model.microTransactionsAvailable()) {
                    if (typeof model.steamOverlayDisabled === 'function')
                        model.steamOverlayDisabled();
                    return;
                }
                var c = model.commanders()[model.selectedCommanderIndex()];
                if (c) model.addItemToCart(c.ObjectName, 1);
            }, 'model.addCart');

            // Button into the tile template's price row: .div_price floats
            // right, so a non-floated block sibling placed AFTER it fills
            // the remaining width — tile left edge up to the price tag.
            // Styled like the stock green price pill. clickBubble: false
            // keeps the tile's own click binding (commander selection) out
            // of it.
            var $price = $('#commander-list .div_price');
            if (!paqol.optional($price.length === 1,
                'armory tile template not found (div_price x' + $price.length + ');')) return;
            // gate on allowMicroTransactions like every stock cart control —
            // with it off there is no cart tab to add to
            $price.after(
                '<span class="paqol-cart-add" data-bind="visible: model.allowMicroTransactions() && model.paqolBuyable($data), ' +
                'text: model.paqolInCart($data) ? \'Remove from cart\' : \'Add to cart\', ' +
                'css: { \'paqol-cart-in\': model.paqolInCart($data) }, ' +
                'click: function (d, e) { model.paqolCartToggle($data); }, clickBubble: false, ' +
                'click_sound: \'default\'"></span>');

            // "Buy All Available" next to the stock Add To Cart hero button
            // in the commit footer (inside the same allowMicroTransactions /
            // showCommanders ko-if region, so it inherits that gating).
            // NB: pre-bind, the hidden expansion tab's button is in the DOM
            // too and its binding ($root.addCartExpansion) contains
            // "$root.addCart" as a prefix — match the word boundary.
            var $hero = $('div.btn_hero').filter(function () {
                return /\$root\.addCart\s*,/.test($(this).attr('data-bind') || '');
            });
            if (paqol.optional($hero.length === 1,
                'stock Add To Cart button not found (btn_hero x' + $hero.length + ');')) {
                // Remove state wears the stock RED button skin (btn_neg)
                // rather than tinting btn_hero — the hero look is a
                // border-image, so a background color just bleeds out
                // behind it.
                // Buy All / Remove All toggle, then Checkout (jumps to the
                // cart tab, where the stock purchase flow lives) shown only
                // while something is in the cart.
                $hero.after(
                    '<div class="paqol-buy-all" data-bind="click: model.paqolCartAllToggle, ' +
                    'css: { btn_hero: !model.paqolCartHasItems(), btn_neg: model.paqolCartHasItems(), ' +
                    'disabled: !model.paqolCartHasItems() && !model.paqolHasBuyable() }, ' +
                    'visible: signedInToUbernet, click_sound: \'default\'">' +
                    '<div class="btn_label" style="padding:0px 20px;" ' +
                    'data-bind="text: model.paqolBuyAllLabel()"></div></div>' +
                    '<div class="btn_hero paqol-checkout" data-bind="click: function () { model.navToTab(\'cart\'); }, ' +
                    'visible: signedInToUbernet() && model.paqolCartHasItems(), click_sound: \'default\'">' +
                    '<div class="btn_label" style="padding:0px 30px;" ' +
                    'data-bind="text: model.paqolCheckoutLabel()"></div></div>');
                // per-tile buttons + Buy All make the stock detail-pane
                // Add To Cart redundant — drop it (removal, not hide: its
                // visible binding would re-show it on sign-in changes)
                $hero.remove();
            }

            // the stock "Item is already in cart." notice is redundant next
            // to the per-tile red Remove state
            $('.div_commit_cont span[data-bind*="selectedItemIsInCart"]').remove();
        }
    });
})();
