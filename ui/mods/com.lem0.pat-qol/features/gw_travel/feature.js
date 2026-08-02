// PA:T QoL — faster Galactic War map travel. ES5 only.
//
// Long node-to-node hops on the GW map animate at a fixed speed
// (gw_play.js:650, moveSpeed in Galactic Units/ms) and can take several
// seconds. moveSpeed is a ko observable on the player view model, so no
// shadow is needed — multiply it once. The player VM is created when the
// campaign state loads (gw_play.js:3225), which is AFTER mod injection, so
// poll briefly until it exists.
(function () {
    'use strict';

    var FACTOR = 3;

    paqol.registry.add({
        id: 'gw_travel',
        scenes: ['gw_play'],
        requires: ['ko', '_'],
        init: function () {
            // The player VM is REBUILT every time the campaign state
            // reloads (gw_play.js:3225) — including on return from each
            // battle — so this check must stay alive for the page's whole
            // life, re-boosting every fresh instance exactly once (the
            // flag lives on the instance).
            setInterval(function () {
                var p = window.model && model.player;
                if (!p || typeof p.moveSpeed !== 'function' || p.paqolTravelBoost) return;
                p.paqolTravelBoost = true;
                p.moveSpeed(p.moveSpeed() * FACTOR);
                paqol.log.info('GW travel speed x' + FACTOR);
            }, 500);
        }
    });
})();
