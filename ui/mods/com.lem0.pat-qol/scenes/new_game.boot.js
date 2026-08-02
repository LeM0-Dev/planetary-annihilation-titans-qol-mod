// PA:T QoL — new_game (lobby) scene boot. ES5 only.
(function () {
    'use strict';
    if (!paqol.claimScene('new_game')) return;
    paqol.registry.run('new_game');
})();
