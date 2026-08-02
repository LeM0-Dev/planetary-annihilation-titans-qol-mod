// PA QoL — game-time formatter. Pure ES5, node-testable.
// A wrong number is worse than an obviously missing one: anything invalid
// renders as '--:--' (Rule 6).
var paqolTimefmt = (function () {
    'use strict';

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function format(seconds) {
        if (typeof seconds !== 'number' || isNaN(seconds) || !isFinite(seconds) || seconds < 0)
            return '--:--';
        var total = Math.floor(seconds);
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
        return m + ':' + pad(s);
    }

    return { format: format };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = paqolTimefmt;
