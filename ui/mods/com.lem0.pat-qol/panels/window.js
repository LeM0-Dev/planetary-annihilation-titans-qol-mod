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

    // army_id -> player name/color, from live_game's player_data broadcast
    // (live_game.js:891 sends it to every child panel).
    var armyName = {};
    var armyColor = {};
    var colorRev = ko.observable(0); // re-render hook for late roster arrival

    // ---- unit icons -----------------------------------------------------
    // Build-bar icon is pure path derivation (shared/js/build.js). The
    // strategic ("zoomed out") icon needs si_name from the unit spec, which
    // may live up the base_spec chain — fetched lazily and cached per spec.
    var specCache = {}; // canonical spec -> {si: string|null}
    var specRev = ko.observable(0);

    function canonicalSpec(specId) {
        var m = /(.*\.json)/.exec(specId || '');
        return m ? m[1] : null;
    }

    // Walk the base_spec chain (depth-capped): the unit's own display_name is
    // taken at depth 0, si_name from wherever in the chain it first appears.
    // Both recorded against the ORIGINAL spec key.
    function fetchSi(fromKey, targetKey, depth) {
        if (depth > 3 || typeof $.getJSON !== 'function') return;
        $.getJSON('coui:/' + fromKey).done(function (d) {
            if (!d) return;
            var dirty = false;
            if (depth === 0 && typeof d.display_name === 'string' && d.display_name) {
                specCache[targetKey].display = paqol.loc(d.display_name);
                dirty = true;
            }
            if (depth === 0 && typeof d.sicon_override === 'string' && d.sicon_override) {
                specCache[targetKey].siconOverride = d.sicon_override;
                dirty = true;
            }
            if (typeof d.si_name === 'string' && d.si_name) {
                specCache[targetKey].si = d.si_name;
                dirty = true;
            } else if (typeof d.base_spec === 'string') {
                var baseKey = canonicalSpec(d.base_spec);
                if (baseKey) fetchSi(baseKey, targetKey, depth + 1);
            }
            if (dirty) specRev(specRev() + 1);
        });
    }

    // The name the player actually sees in-game (display_name), once the
    // spec fetch lands; null until then.
    function displayNameFor(specKey) {
        specRev();
        if (!specKey) return null;
        var entry = specCache[specKey];
        if (entry === undefined) {
            specCache[specKey] = { si: null, display: null };
            fetchSi(specKey, specKey, 0);
            return null;
        }
        return entry.display || null;
    }

    // Strategic icon name resolution mirrors the base game (live_game.js
    // siconFor): sicon_override when the spec sets one, otherwise the spec
    // FILENAME stem (icon_si_bot_factory.png). si_name (found up the
    // base_spec chain, e.g. commanders) beats the stem when present.
    // Missing images hide themselves via the img error handler.
    function siIconFor(row) {
        specRev();
        if (!row || !row.specKey) return null;
        var entry = specCache[row.specKey];
        if (entry === undefined) {
            specCache[row.specKey] = { si: null, display: null };
            fetchSi(row.specKey, row.specKey, 0);
            entry = specCache[row.specKey];
        }
        var m = /([^\/]+)\.json$/.exec(row.specKey);
        var si = entry.siconOverride || entry.si || (m && m[1]);
        return si
            ? 'coui://ui/main/atlas/icon_atlas/img/strategic_icons/icon_si_' + si + '.png'
            : null;
    }

    function buildIconFor(row) {
        if (!row || !row.specKey || typeof Build === 'undefined') return null;
        return Build.iconForSpecId(row.specKey);
    }

    // Owner colour when the roster knows the army, otherwise red for enemy,
    // white for ally, default for everything else.
    function rowColorFor(row) {
        colorRev();
        if (!row) return '';
        if (row.army_id !== undefined && row.army_id !== null && armyColor[row.army_id])
            return armyColor[row.army_id];
        if (row.hostile) return '#e88a8a';
        if (row.allied) return '#ffffff';
        return '';
    }

    // NOTE: the engine strips the sender from ping alerts (army_id -1), so
    // pings render unattributed. The name path below only fires if a client
    // ever receives a real army_id on a ping (untested in multiplayer).

    // ------------------------------------------------------------------ model
    model.role = role;
    model.title = ko.observable(role === 'paqol_history' ? 'Notification History' : 'Enemy Targets');
    model.minimized = ko.observable(false);
    model.jump = function (row) {
        var target = row && (row.location ? row : (row.entry && row.entry.location ? row.entry : null));
        if (!target || !target.location) return;
        api.camera.lookAt({ location: target.location, planet_id: target.planet_id, zoom: 'air' }, true);
    };

    // template helpers (shared by both roles)
    model.buildIcon = buildIconFor;
    model.siIcon = siIconFor;
    model.rowColor = rowColorFor;

    // Row text, resolved at render time so the in-game display name (from the
    // lazy spec fetch) and the player roster upgrade rows retroactively:
    //   - commanders read "[player name] Commander" — nobody cares which
    //     commander MODEL it is; the player is the information
    //   - other units use their real in-game display_name (Ragnarok, Angel)
    //     with the filename-derived label as fallback until the fetch lands
    model.rowText = function (row) {
        if (!row) return '';
        var base;
        if (row.template === undefined) {
            base = row.display || row.label || '';
        } else {
            var name;
            if (row.isCommander) {
                colorRev();
                var player = armyName[row.army_id];
                name = player ? player + ' Commander'
                    : (row.hostile ? 'Enemy Commander' : (row.allied ? 'Allied Commander' : 'Commander'));
            } else {
                var display = displayNameFor(row.specKey);
                var prefix = row.noPrefix ? '' : (row.hostile ? 'Enemy ' : (row.allied ? 'Allied ' : ''));
                name = prefix + (display || row.fallbackName);
            }
            base = row.template ? row.template.replace('__name__', name) : name;
        }
        return (row.count > 1) ? base + ' ×' + row.count : base;
    };

    // right-click a row -> remove just that entry
    model.dismiss = function (row) {
        if (!row) return false;
        if (role === 'paqol_history') {
            ring.remove(row);
            if (row.key && lastByKey[row.key] && lastByKey[row.key].row === row)
                delete lastByKey[row.key];
        } else if (row.entry && entries[row.entry.id]) {
            delete entries[row.entry.id];
        }
        rev(rev() + 1);
        return false; // suppress any default context menu
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
        // (row text incl. the ×N counter is composed at render time by
        // model.rowText, so late display-name/roster data upgrades rows)
        ring.push(row);
        rev(rev() + 1);
    }

    function historyRow(alert) {
        var wtName = watchNameById[alert.watch_type];
        var hostile = alert.is_hostile === true;
        var allied = alert.is_allied === true && !hostile;
        var specKey = canonicalSpec(alert.spec_id);
        var hasLocation = !!(alert.location && alert.planet_id !== undefined && alert.planet_id !== null);

        var row = {
            count: 1,
            timeText: paqolTimefmt.format(gameTime),
            specKey: alert.custom ? null : specKey,
            army_id: alert.army_id,
            hostile: hostile,
            allied: allied,
            location: hasLocation ? alert.location : null,
            planet_id: hasLocation ? alert.planet_id : null
        };

        if (alert.custom) {
            row.key = 'custom:' + (alert.name || '');
            row.display = alert.name ? String(alert.name) : 'Alert';
        } else if (wtName === 'ping') {
            // Pings are deliberate player communication: two pings are two
            // messages — key null exempts them from coalescing.
            var pinger = armyName[alert.army_id];
            row.key = null;
            row.display = pinger ? 'Ping — ' + pinger : 'Ping';
        } else {
            row.key = 'wt:' + alert.watch_type + ':' + (specKey || '') + ':' +
                (hostile ? 'h' : (allied ? 'a' : 'o'));
            row.template = WATCH_VERBS[wtName] ||
                ('__name__ ' + humanize(wtName || ('alert ' + alert.watch_type)));
            row.fallbackName = specLabel(alert.spec_id);
            row.isCommander = !!paqolHvt.isType(paqolHvt.BITS.Commander, alert.unit_types);
        }
        return row;
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
        // per-category user toggles (Settings -> PA:T QOL -> Target window)
        if (prefs.hvtTargets && prefs.hvtTargets[cat.key] === false) return;

        entries[alert.id] = {
            id: alert.id,
            rank: cat.rank,
            catKey: cat.key,
            label: specLabel(alert.spec_id),
            specKey: canonicalSpec(alert.spec_id),
            army_id: alert.army_id,
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
                    template: '',            // rowText: name only
                    noPrefix: true,          // everything here is enemy already
                    fallbackName: e.label,
                    isCommander: e.catKey === 'commander',
                    specKey: e.specKey,
                    army_id: e.army_id,
                    hostile: true,
                    count: 1,
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

    handlers.player_data = function (payload) {
        if (!payload || !_.isArray(payload.ids)) return;
        armyName = {};
        armyColor = {};
        for (var i = 0; i < payload.ids.length; i++) {
            if (_.isArray(payload.names)) armyName[payload.ids[i]] = payload.names[i];
            if (_.isArray(payload.colors)) armyColor[payload.ids[i]] = payload.colors[i];
        }
        colorRev(colorRev() + 1); // recolour already-rendered rows
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
            display: humanize(payload.name),
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

    // player_data is broadcast on CHANGE and the first broadcast usually
    // fires before this page finishes registering, so pull the roster once —
    // the same pattern the stock alert panel uses (parentQuery('playerData')).
    try {
        api.Panel.query(api.Panel.parentId, 'panel.invoke', ['playerData'])
            .then(function (payload) {
                if (payload) handlers.player_data(payload);
            });
    } catch (e) {
        paqol.log.warn('playerData pull failed; ping attribution starts with the next roster change.', e);
    }

    paqol.log.info('window "' + role + '" ready (v' + paqol.VERSION + ').');
})();
