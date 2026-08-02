// PA QoL — capped newest-first buffer. Pure ES5, node-testable.
var paqolRing = (function () {
    'use strict';

    function create(cap) {
        var items = [];
        var capacity = normalize(cap);

        function normalize(c) {
            if (typeof c !== 'number' || isNaN(c) || c < 1) return 300;
            return Math.min(Math.floor(c), 5000);
        }

        return {
            push: function (item) {
                items.unshift(item);
                if (items.length > capacity) items.length = capacity;
            },
            items: function () { return items; },       // newest first; treat as read-only
            // Remove a specific item (identity match). Used when coalescing
            // a repeat into a fresh top entry.
            remove: function (item) {
                for (var i = 0; i < items.length; i++) {
                    if (items[i] === item) { items.splice(i, 1); return true; }
                }
                return false;
            },
            size: function () { return items.length; },
            cap: function () { return capacity; },
            setCap: function (c) {
                capacity = normalize(c);
                if (items.length > capacity) items.length = capacity;
            },
            clear: function () { items.length = 0; }
        };
    }

    return { create: create };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = paqolRing;
