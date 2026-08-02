// PA QoL — floating window panel page. ES5 only.
//
// One page serves both windows; the role comes from the <panel> element id
// (api.Panel.pageName): 'paqol_history' or 'paqol_hvt'.
//
// Data arrives directly from the engine: watch_list / custom_alert / time are
// broadcast to every view that declares the handler in api.Panel.ready (the
// stock time_bar and unit_alert panels both declare watch_list). Derived
// event notifications (nuke_ready, ...) are forwarded by the live_game host
// as 'paqol_event'. Drag/resize/minimize are OWNED BY THE PARENT (the panel
// element's box is the composited region); this page only streams cursor
// positions to it via the base game's handlers['panel.invoke'].
(function () {
    'use strict';

    var model = {};
    var handlers = {};

    var role = (window.api && api.Panel && api.Panel.pageName) || '';
    if (role !== 'paqol_history' && role !== 'paqol_hvt') {
        console.error('[' + paqol.MOD_ID + '] window page loaded with unknown panel name "' + role + '"');
        return;
    }

    var prefs = paqol.store.get('prefs') || {};
    var gameTime = null;
    var STALE_SECONDS = 300;

    function toParent(fnName, args) {
        api.Panel.message(api.Panel.parentId, 'panel.invoke', [fnName].concat(args));
    }

    function humanize(name) { return String(name).replace(/_/g, ' '); }

    // 'x/nuke_launcher/nuke_launcher.json' -> 'Nuke launcher'
    function specLabel(specId) {
        if (typeof specId !== 'string') return 'Unit';
        var m = /([^\/]+)\.json/.exec(specId);
        if (!m) return 'Unit';
        var s = humanize(m[1]);
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    var watchNameById = {};
    if (window.constants && constants.watch_type)
        _.forEach(constants.watch_type, function (id, name) { watchNameById[id] = name; });

    // ------------------------------------------------------------------ model
    model.role = role;
    model.title = ko.observable(role === 'paqol_history' ? 'Notification History' : 'Enemy Targets');
    model.minimized = ko.observable(false);
    model.jump = function (row) {
        var target = row && (row.location ? row : (row.entry && row.entry.location ? row.entry : null));
        if (!target || !target.location) return;
        api.camera.lookAt({ location: target.location, planet_id: target.planet_id, zoom: 'air' }, true);
    };

    var RENDER_MAX = 150;
    var ring = paqolRing.create(prefs.historyCap || 300);
    var rev = ko.observable(0);
    var tick = ko.observable(0);
    setInterval(function () { tick(tick() + 1); }, 5000);

    var WATCH_VERBS = {
        ready: '__name__ ready',
        damage: '__name__ under attack',
        death: '__name__ destroyed',
        ping: 'Ping',
        sight: '__name__ sighted',
        projectile: '__name__ launch detected',
        first_contact: 'Enemy contact',
        target_destroyed: '__name__ target destroyed',
        allied_death: '__name__ lost',
        idle: '__name__ idle',
        arrival: '__name__ arrived',
        departure: '__name__ departing',
        linked: '__name__ linked'
    };

    // Derived events that duplicate a watch alert we already render with a
    // better row (name + location). Rendering both spams two rows for one
    // thing — e.g. 'enemy_commander_under_attack' plus the commander's own
    // red damage alert. The alert row wins; these are dropped.
    var SUPPRESSED_DERIVED = {
        commander_under_attack: true,
        allied_commander_under_attack: true,
        enemy_commander_under_attack: true,
        enemy_commander_sighted: true,
        new_enemy_contact: true,
        commander_destroyed: true,
        allied_commander_destroyed: true,
        enemy_commander_destroyed: true
    };

    if (role === 'paqol_history') {
        model.rows = ko.computed(function () {
            rev();
            return ring.items().slice(0, RENDER_MAX);
        });
        model.hiddenCount = ko.computed(function () {
            rev();
            return Math.max(0, ring.size() - RENDER_MAX);
        });
    }

    // Battle anti-spam: a row repeating the same thing within this wall-clock
    // window is coalesced into one fresh top row with a ×N counter instead of
    // flooding the list.
    var COALESCE_MS = 15000;
    var lastByKey = {}; // key -> {row, at}

    function pushHistory(row) {
        var prev = row.key && lastByKey[row.key];
        var now = _.now();
        if (prev && (now - prev.at) < COALESCE_MS) {
            row.count = (prev.row.count || 1) + 1;
            ring.remove(prev.row);
        }
        if (row.key) lastByKey[row.key] = { row: row, at: now };
        row.display = row.count > 1 ? row.text + ' ×' + row.count : row.text;
        ring.push(row);
        rev(rev() + 1);
    }

    function historyRow(alert) {
        var wtName = watchNameById[alert.watch_type];
        var template = WATCH_VERBS[wtName];
        var hostile = alert.is_hostile === true;
        var allied = alert.is_allied === true && !hostile;
        var name = specLabel(alert.spec_id);
        if (hostile) name = 'Enemy ' + name;
        else if (allied) name = 'Allied ' + name;

        var text;
        if (alert.custom) text = alert.name ? String(alert.name) : 'Alert';
        else if (template) text = template.replace('__name__', name);
        else text = name + ' ' + humanize(wtName || ('alert ' + alert.watch_type));

        var hasLocation = !!(alert.location && alert.planet_id !== undefined && alert.planet_id !== null);
        var spec = /(.*\.json)/.exec(alert.spec_id || '');
        // Pings are deliberate player communication: two pings are two
        // messages (different senders, different spots) — never merge them.
        // key null = exempt from coalescing.
        var key;
        if (wtName === 'ping') key = null;
        else if (alert.custom) key = 'custom:' + (alert.name || '');
        else key = 'wt:' + alert.watch_type + ':' + (spec ? spec[1] : '') + ':' + (hostile ? 'h' : (allied ? 'a' : 'o'));
        return {
            key: key,
            count: 1,
            timeText: paqolTimefmt.format(gameTime),
            text: text,
            hostile: hostile,
            location: hasLocation ? alert.location : null,
            planet_id: hasLocation ? alert.planet_id : null
        };
    }

    // ---- enemy HVT state
    var entries = {};

    function hvtIngest(alert) {
        var WT = constants.watch_type;
        if (alert.custom || alert.id === undefined || alert.id === null) return;

        if (alert.watch_type === WT.death || alert.watch_type === WT.target_destroyed) {
            if (entries[alert.id]) { delete entries[alert.id]; rev(rev() + 1); }
            return;
        }
        var existing = entries[alert.id];
        if (existing) {
            if (alert.location) existing.location = alert.location;
            if (alert.planet_id !== undefined) existing.planet_id = alert.planet_id;
            existing.lastSeen = gameTime;
            rev(rev() + 1);
            return;
        }
        if (alert.watch_type !== WT.sight && alert.watch_type !== WT.first_contact) return;
        if (alert.is_hostile !== true) return;
        var cat = paqolHvt.classify(alert.unit_types, alert.spec_id);
        if (!cat) return;
        // per-category user toggles (Settings -> PA QOL -> Target window)
        if (prefs.hvtTargets && prefs.hvtTargets[cat.key] === false) return;

        entries[alert.id] = {
            id: alert.id,
            rank: cat.rank,
            label: specLabel(alert.spec_id),
            location: alert.location || null,
            planet_id: (alert.planet_id === undefined) ? null : alert.planet_id,
            lastSeen: gameTime
        };
        rev(rev() + 1);
    }

    if (role === 'paqol_hvt') {
        model.rows = ko.computed(function () {
            rev(); tick();
            var list = _.sortBy(_.values(entries), function (e) {
                return e.rank * 1e9 - (e.lastSeen || 0);
            });
            return _.map(list, function (e) {
                var stale = (typeof gameTime === 'number' && typeof e.lastSeen === 'number')
                    ? (gameTime - e.lastSeen) > STALE_SECONDS : false;
                return {
                    entry: e,
                    label: e.label,
                    seenText: paqolTimefmt.format(e.lastSeen),
                    stale: stale,
                    clickable: !!(e.location && e.planet_id !== null)
                };
            });
        });
    }

    // --------------------------------------------------------------- handlers
    handlers.time = function (payload) {
        if (!payload || payload.view !== 0) return;
        if (typeof payload.current_time === 'number' && !isNaN(payload.current_time))
            gameTime = payload.current_time;
    };

    handlers.watch_list = function (payload) {
        if (!payload || !_.isArray(payload.list)) return;
        for (var i = 0; i < payload.list.length; i++) {
            var alert = payload.list[i];
            if (!alert || typeof alert !== 'object') continue;
            if (role === 'paqol_history') pushHistory(historyRow(alert));
            else hvtIngest(alert);
        }
    };

    handlers.custom_alert = function (payload) {
        if (role !== 'paqol_history' || !payload) return;
        pushHistory(historyRow({ custom: true, name: payload.name }));
    };

    // Derived event notifications, forwarded by the live_game host.
    handlers.paqol_event = function (payload) {
        if (role !== 'paqol_history' || !payload || !payload.name) return;
        if (SUPPRESSED_DERIVED[payload.name]) return; // alert twin renders instead
        pushHistory({
            key: 'ev:' + payload.name,
            count: 1,
            timeText: paqolTimefmt.format(gameTime),
            text: humanize(payload.name),
            hostile: false, location: null, planet_id: null
        });
    };

    handlers.paqol_state = function (payload) {
        if (payload && typeof payload.minimized === 'boolean')
            model.minimized(payload.minimized);
    };

    // --------------------------------------------------- drag/resize plumbing
    // The parent owns the element box. This page streams cursor positions in
    // ITS OWN coordinates; the parent converts (element pos + local) and also
    // tracks its own mousemove for when the cursor escapes this small view.
    function stream(kind, e) {
        toParent('paqolWin' + kind, [role, e.clientX, e.clientY]);
    }

    var mode = null; // 'Drag' | 'Resize'

    $(document).on('mousemove.paqol', function (e) {
        if (mode) stream(mode + 'Move', e);
    });
    $(document).on('mouseup.paqol', function () {
        if (mode) { toParent('paqolWin' + mode + 'End', [role]); mode = null; }
    });

    $('#paqol-win-title').on('mousedown', function (e) {
        if (e.target && e.target.id === 'paqol-win-minimize') return;
        mode = 'Drag';
        toParent('paqolWinDragStart', [role, e.clientX, e.clientY]);
        e.preventDefault();
    });

    $('#paqol-win-grip').on('mousedown', function (e) {
        mode = 'Resize';
        toParent('paqolWinResizeStart', [role, e.clientX, e.clientY]);
        e.preventDefault();
    });

    $('#paqol-win-minimize').on('click', function () {
        toParent('paqolWinToggleMin', [role]);
    });

    // Mousewheel: unless the page consumes the event (preventDefault), the
    // engine forwards it to the game as camera zoom — the same reason the
    // stock build bar squelches it (live_game_build_bar.js:739-746). Scroll
    // the list ourselves and consume.
    (function () {
        var body = document.querySelector('.paqol-win-body');
        function onWheel(e) {
            var ev = e.originalEvent || e;
            var up = ev.wheelDelta !== undefined ? (ev.wheelDelta > 0) : (ev.detail < 0);
            if (body) body.scrollTop += up ? -60 : 60;
            e.preventDefault();
            return false;
        }
        $(document).on('mousewheel DOMMouseScroll', onWheel);
    })();

    // ------------------------------------------------------------------ boot
    app.registerWithCoherent(model, handlers);
    ko.applyBindings(model);
    paqol.log.info('window "' + role + '" ready (v' + paqol.VERSION + ').');
})();
