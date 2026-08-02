// PA QoL — settings scene boot. ES5 only.
(function () {
    'use strict';
    if (!paqol.claimScene('settings')) return;
    paqol.registry.run('settings');
})();
