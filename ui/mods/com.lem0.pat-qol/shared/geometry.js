// PA QoL — floating-panel geometry math. Pure ES5, node-testable.
var paqolGeometry = (function () {
    'use strict';

    function num(v) { return typeof v === 'number' && !isNaN(v) && isFinite(v); }

    // geom:     {left, top, width, height}   (may be garbage; sanitized here)
    // viewport: {w, h}
    // opts:     {minWidth, minHeight, defaults, keepVisible}
    // Guarantees the returned geometry is numeric, respects minimum size,
    // fits the viewport, and keeps at least keepVisible px of the title bar
    // reachable on all four sides.
    function clamp(geom, viewport, opts) {
        opts = opts || {};
        var defaults = opts.defaults || { left: 40, top: 120, width: 320, height: 240 };
        var minW = num(opts.minWidth) ? opts.minWidth : 100;
        var minH = num(opts.minHeight) ? opts.minHeight : 80;
        var keep = num(opts.keepVisible) ? opts.keepVisible : 48;

        if (!geom || typeof geom !== 'object') geom = {};
        var g = {
            left: num(geom.left) ? geom.left : defaults.left,
            top: num(geom.top) ? geom.top : defaults.top,
            width: num(geom.width) ? geom.width : defaults.width,
            height: num(geom.height) ? geom.height : defaults.height
        };

        var vw = num(viewport && viewport.w) ? viewport.w : 1024;
        var vh = num(viewport && viewport.h) ? viewport.h : 768;

        g.width = Math.max(minW, Math.min(g.width, vw));
        g.height = Math.max(minH, Math.min(g.height, vh));

        // keep at least `keep` px of the panel inside the viewport
        g.left = Math.max(keep - g.width, Math.min(g.left, vw - keep));
        g.top = Math.max(0, Math.min(g.top, vh - keep));

        return g;
    }

    return { clamp: clamp };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = paqolGeometry;
