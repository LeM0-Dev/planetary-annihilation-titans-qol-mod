// PA QoL — live_game scene boot. ES5 only.
// Runs synchronously at the mod-injection point: after model = new
// LiveGameViewModel() and all handlers.* exist, before registerWithCoherent
// and ko.applyBindings.
(function () {
    'use strict';
    if (!paqol.claimScene('live_game')) return;

    paqol.registry.run('live_game');
    paqol.log.info('v' + paqol.VERSION + ' loaded in live_game.');
})();
