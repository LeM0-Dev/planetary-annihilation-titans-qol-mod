// PA:T QoL — gw_start scene boot. ES5 only.
(function () {
    'use strict';
    if (!paqol.claimScene('gw_start')) return;
    paqol.registry.run('gw_start');
})();
