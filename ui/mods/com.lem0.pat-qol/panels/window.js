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
    // the own/allied content splits across three windows sharing the same
    // data machinery — each polls only what it renders
    var IS_UNITS = role === 'paqol_units';        // own MOBILE: commander, stuck, fabbers, combat
    var IS_STRUCTS = role === 'paqol_structures'; // own STRUCTURES: idle factories, nuke/anti status
    var IS_ALLIES = role === 'paqol_allies';      // everything allied
    var IS_UNIT_FAMILY = IS_UNITS || IS_STRUCTS || IS_ALLIES;
    var IS_GWINFO = role === 'paqol_gwinfo';      // static GW battle intel
    if (role !== 'paqol_history' && role !== 'paqol_hvt' && !IS_UNIT_FAMILY && !IS_GWINFO) {
        console.error('[' + paqol.MOD_ID + '] window page loaded with unknown panel name "' + role + '"');
        return;
    }

    var prefs = paqol.store.get('prefs') || {};
    // user-set text/icon scale: CSS zoom scales the whole page content
    // (text, icons, paddings) inside the fixed panel box
    // 100% deliberately maps to raw zoom 0.9 — the original 1:1 rendering
    // was oversized, so the user-facing scale is rebased 10% down.
    var SCALE_BASE = 0.9;
    var appliedScale = null;
    function applyScale(p) {
        var s = (p && typeof p.windowScale === 'number') ? p.windowScale : 100;
        if (s === appliedScale) return;
        appliedScale = s;
        document.body.style.zoom = String(s * SCALE_BASE / 100);
    }
    applyScale(prefs);
    // the in-game settings panel is a separate page sharing localStorage —
    // re-read (cache-bypassing) so scale/toggle changes apply mid-game
    setInterval(function () {
        try {
            prefs = paqol.store.reload('prefs') || {};
            applyScale(prefs);
        } catch (e) { /* keep current */ }
    }, 2000);
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
    var ownArmyId = null;            // the engine sets is_allied on OWN units
                                     // too; this tells 'yours' from 'Allied'
    var colorRev = ko.observable(0); // re-render hook for late roster arrival

    // ---- unit icons -----------------------------------------------------
    // Build-bar icon is pure path derivation (shared/js/build.js). The
    // strategic ("zoomed out") icon needs si_name from the unit spec, which
    // may live up the base_spec chain — fetched lazily and cached per spec.
    // BOUNDING INVARIANT: keyed by canonical spec path — bounded by the
    // game's unit roster (~hundreds), never by unit ids. Keep it that way.
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

    // Dark army colours (deep purple, navy, forest green) are unreadable on
    // the near-black window. Lift anything below a luminance floor toward
    // white just enough to clear it — the hue survives, purple stays purple.
    var LUMA_FLOOR = 0.45;
    // BOUNDING INVARIANT: keyed by army colour string — at most one per player.
    var brightCache = {};
    function brighten(color) {
        if (brightCache[color] !== undefined) return brightCache[color];
        var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
        var out = color;
        if (m) {
            var r = +m[1], g = +m[2], b = +m[3];
            var l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            if (l < LUMA_FLOOR) {
                var t = (LUMA_FLOOR - l) / (1 - l);
                r = Math.round(r + (255 - r) * t);
                g = Math.round(g + (255 - g) * t);
                b = Math.round(b + (255 - b) * t);
                out = 'rgb(' + r + ',' + g + ',' + b + ')';
            }
        }
        brightCache[color] = out;
        return out;
    }

    // Owner colour when the roster knows the army, otherwise red for enemy,
    // white for ally, default for everything else.
    function rowColorFor(row) {
        colorRev();
        if (!row) return '';
        if (row.forceColor) return row.forceColor; // e.g. pings: always white
        if (row.army_id !== undefined && row.army_id !== null && armyColor[row.army_id])
            return brighten(armyColor[row.army_id]);
        if (row.hostile) return '#e88a8a';
        if (row.allied) return '#ffffff';
        return '';
    }

    // NOTE: ping alerts arrive with no sender (army_id -1) and are rendered
    // as plain white 'Ping' rows by design.

    // ------------------------------------------------------------------ model
    model.role = role;
    model.title = ko.observable(
        role === 'paqol_history' ? 'Notification History'
            : role === 'paqol_hvt' ? 'Enemy Targets'
                : IS_UNITS ? 'Own Units'
                    : IS_STRUCTS ? 'Own Structures'
                        : IS_GWINFO ? 'Game Info' : 'Allies');
    model.minimized = ko.observable(false);
    // nuke rows: single click selects ONLY (no camera yank while managing
    // silos); a second click within the window jumps too
    var lastNukeClick = { id: null, at: 0 };
    model.jump = function (row) {
        // clicking your own commander also SELECTS him; clicking a stuck
        // group selects those units so re-pathing is one order away
        if (row && api.select) {
            if (row.kind === 'commander' && ownArmyId !== null && row.army_id === ownArmyId &&
                row.colonel && row.refId !== undefined &&
                typeof api.select.unitsById === 'function')
                api.select.unitsById([Number(row.refId)]); // select.commander() would grab the REAL commander
            else if (row.kind === 'commander' && ownArmyId !== null && row.army_id === ownArmyId &&
                typeof api.select.commander === 'function')
                api.select.commander();
            // NB: the JS wrapper is unitsById — the engine call underneath is
            // named select.byIds, but api.select.byIds does NOT exist
            else if ((row.kind === 'stuck' || row.kind === 'fabbers') &&
                _.isArray(row.refIds) && row.refIds.length &&
                typeof api.select.unitsById === 'function')
                api.select.unitsById(row.refIds);
            else if ((row.kind === 'idle' || row.kind === 'nuke') && row.refId !== undefined &&
                typeof api.select.unitsById === 'function')
                api.select.unitsById([Number(row.refId)]);
        }
        // finished nuke rows (Preparing/READY): first click = select only,
        // double click = jump as well. Building rows jump like everything.
        if (row && row.kind === 'nuke' && !row.building) {
            var now = new Date().getTime();
            var again = lastNukeClick.id === row.refId && (now - lastNukeClick.at) < 450;
            lastNukeClick = { id: row.refId, at: now };
            if (!again) return;
        }
        var target = row && (row.location ? row : (row.entry && row.entry.location ? row.entry : null));
        if (target && target.location && target.planet_id !== null && target.planet_id !== undefined) {
            api.camera.lookAt({ location: target.location, planet_id: target.planet_id, zoom: 'air' }, true);
            return;
        }
        // no usable location+id pair — at least get the right planet
        if (row && row.planetIndex !== undefined && row.planetIndex !== null &&
            api.camera && typeof api.camera.focusPlanet === 'function')
            api.camera.focusPlanet(row.planetIndex);
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
                var word = row.roleWord || 'Commander'; // Colonels are support commanders
                var player = armyName[row.army_id];
                name = player ? player + ' ' + word
                    : (row.hostile ? 'Enemy ' + word : (row.allied ? 'Allied ' + word : word));
            } else {
                var display = displayNameFor(row.specKey);
                var own = ownArmyId !== null && row.army_id === ownArmyId;
                var prefix = (row.noPrefix || own) ? ''
                    : (row.hostile ? 'Enemy ' : (row.allied ? 'Allied ' : ''));
                name = prefix + (display || row.fallbackName);
            }
            base = row.template ? row.template.replace('__name__', name) : name;
        }
        if (row.count > 1) base += ' ×' + row.count;
        if (row.idleTag) base += ' [IDLE]';
        return base;
    };

    // right-click a row -> remove just that entry
    model.dismiss = function (row) {
        if (!row) return false;
        if (role === 'paqol_history') {
            ring.remove(row);
            if (row.key && lastByKey[row.key] && lastByKey[row.key].row === row)
                delete lastByKey[row.key];
        } else if (IS_UNIT_FAMILY) {
            if (row.kind === 'combat') delete combats[row.refId];
            else if (row.kind === 'idle') delete idleFactories[row.refId];
            else if (row.kind === 'stuck') {
                // suppress these exact units until they move again
                _.forEach(row.refIds || [], function (id) { stuckDismissed[id] = true; });
                stuckRows = _.reject(stuckRows, function (c) { return c.ids === row.refIds; });
            }
            else if (row.kind === 'fabbers')
                _.forEach(row.refIds || [], function (id) { delete idleFabbers[id]; });
            // commander rows are re-polled; dismissing them is meaningless
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

    // Derived events kept OUT of the history window. Two reasons:
    //  - duplicates of a watch alert we already render with a better row
    //    (name + location), e.g. 'enemy_commander_under_attack' next to the
    //    commander's own red damage alert — the alert row wins;
    //  - pure clutter with no tactical value as a log line (continuous-build
    //    toggles fire constantly). Their VOICE lines are unaffected — that's
    //    the settings tab's job.
    var SUPPRESSED_DERIVED = {
        commander_under_attack: true,
        allied_commander_under_attack: true,
        enemy_commander_under_attack: true,
        enemy_commander_sighted: true,
        new_enemy_contact: true,
        commander_destroyed: true,
        allied_commander_destroyed: true,
        enemy_commander_destroyed: true,
        construction_continuous_on: true,
        construction_continuous_off: true
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
            // messages — key null exempts them from coalescing. The engine
            // strips the sender (army_id -1), so no attribution: always
            // plain 'Ping', always white.
            row.key = null;
            row.display = 'Ping';
            row.forceColor = '#ffffff';
        } else if (wtName === 'projectile') {
            // Every launch (nukes etc.) is its own tactical event with its
            // own trajectory — never merge them either.
            row.key = null;
            row.template = WATCH_VERBS.projectile;
            row.fallbackName = specLabel(alert.spec_id);
            row.isCommander = false;
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

    // ---- OWN & ALLIED state ('paqol_units' role) --------------------------
    // Three feeds: the roster (host push, alliances + army indices), the
    // engine's combat_list broadcast, and idle-factory watch alerts (the
    // host repopulates the engine's idle watch list, which ships empty).
    // Commanders are found by polling the worldview API for own/allied
    // armies — the same call the base game makes for the player's own army.
    var roster = [];            // [{id,index,name,color,defeated,state}]
    // Engine messages identify armies by INDEX into the sim's army list;
    // the roster array may have gaps (the host skips replay/observer
    // entries), so NEVER index it positionally — use this map.
    var rosterByIndex = {};     // engine army index -> roster entry
    var planetCount = 0;        // worldview scans are per-planet
    var planetIdByIndex = {};   // camera targets need the ID, not the index
    var planetNameById = {};    // planet id -> display name (for grouping labels)
    var combats = {};           // id -> {group, location, planet_id, at}
    var idleFactories = {};     // alert id (= unit id) -> row source
    var idleFabbers = {};       // alert id (= unit id) -> {planet_id, location, at}
    var commanders = [];        // [{group, army_id, specKey, planet, location, idle}]

    function rosterGroup(armyId) {
        for (var i = 0; i < roster.length; i++)
            if (roster[i].id === armyId) return roster[i].state;
        return null;
    }

    handlers.paqol_roster = function (payload) {
        if (!payload || !_.isArray(payload.roster)) return;
        roster = payload.roster;
        rosterByIndex = {};
        _.forEach(roster, function (r) {
            if (r && typeof r.index === 'number') rosterByIndex[r.index] = r;
        });
        if (typeof payload.planetCount === 'number') planetCount = payload.planetCount;
        if (_.isArray(payload.planets)) {
            planetIdByIndex = {};
            planetNameById = {};
            _.forEach(payload.planets, function (p) {
                if (p && p.id !== null && p.id !== undefined) {
                    planetIdByIndex[p.index] = p.id;
                    if (p.name) planetNameById[p.id] = p.name;
                }
            });
        }
        rev(rev() + 1);
    };

    handlers.combat_list = function (payload) {
        if (!(IS_UNITS || IS_ALLIES) || !payload || !_.isArray(payload.list)) return;
        var changed = false;
        for (var i = 0; i < payload.list.length; i++) {
            var c = payload.list[i];
            if (!c || c.id === undefined) continue;
            // which of my/allied armies is involved?
            var group = null;
            _.forEach(c.damaged_entities || [], function (ent) {
                if (!ent || group === 'own') return;
                var r = rosterByIndex[ent.army_idx];
                if (r && (r.state === 'own' || (r.state === 'allied' && group === null)))
                    group = r.state;
            });
            if (!group) continue;
            combats[c.id] = {
                id: c.id,
                group: group,
                location: c.last_location || c.average_location || null,
                planet_id: (c.planet_id === undefined) ? null : c.planet_id,
                at: (typeof c.last_event_time === 'number') ? c.last_event_time : gameTime,
                expires: (typeof c.last_event_time === 'number' && typeof c.lifespan === 'number')
                    ? c.last_event_time + c.lifespan : null
            };
            changed = true;
        }
        if (changed) rev(rev() + 1);
    };

    function unitsIngest(alert) {
        var WT = constants.watch_type;
        if (alert.is_hostile === true) return;
        // ammo stock changes (base game registers the ammo watch for
        // Nuke/NukeDefense): the ONLY source of launcher missile counts —
        // ammo units are invisible to getArmyUnits/getUnitState
        if (alert.watch_type === WT.ammo_fraction_change) {
            if (IS_STRUCTS && typeof alert.ammo_count === 'number' && alert.id !== undefined) {
                ammoByUnit[alert.id] = {
                    count: alert.ammo_count,
                    max: (typeof alert.max_ammo_count === 'number') ? alert.max_ammo_count : 0
                };
                rev(rev() + 1);
            }
            return;
        }
        if (alert.watch_type === WT.idle) {
            // with a roster loaded, an army we cannot place is NOT ours
            // (e.g. the GW co-op sub-commander before/despite mapping)
            var group = rosterGroup(alert.army_id) || (roster.length ? null : 'own');
            if (!group || group === 'hostile') return;
            var UT = window.constants && constants.unit_type;
            // commanders show their own [IDLE] tag; skip them here
            if (UT && (paqolHvt.isType(UT.Commander, alert.unit_types) ||
                paqolHvt.isType(UT.SupportCommander, alert.unit_types))) return;
            // nuke/anti-nuke launchers and unit cannons have their own
            // dedicated status rows — an extra "idle" row is noise
            if (alert.spec_id && (NUKE_SPEC.test(alert.spec_id) || ANTI_SPEC.test(alert.spec_id) ||
                UC_SPEC.test(alert.spec_id))) return;
            if (UT && paqolHvt.isType(UT.Fabber, alert.unit_types) &&
                !paqolHvt.isType(UT.Factory, alert.unit_types)) {
                // mobile fabricators: aggregated per planet, not per unit
                if (!IS_UNITS) return; // fabbers render in Own Units
                // strictly YOUR army — in GW co-op the sub-commander's army
                // also produces idle alerts and its fabbers are not yours
                if (group !== 'own') return;
                idleFabbers[alert.id] = {
                    location: alert.location || null,
                    planet_id: (alert.planet_id === undefined) ? null : alert.planet_id,
                    at: gameTime
                };
            } else {
                // factories render in Own Structures (allied idles never
                // arrive — the engine's idle watch is own-army only)
                if (!IS_STRUCTS) return;
                idleFactories[alert.id] = {
                    group: group,
                    specKey: canonicalSpec(alert.spec_id),
                    fallbackName: specLabel(alert.spec_id),
                    army_id: alert.army_id,
                    location: alert.location || null,
                    planet_id: (alert.planet_id === undefined) ? null : alert.planet_id,
                    at: gameTime
                };
            }
            rev(rev() + 1);
        } else if (alert.watch_type === WT.death || alert.watch_type === WT.target_destroyed) {
            if (idleFactories[alert.id]) { delete idleFactories[alert.id]; rev(rev() + 1); }
            if (idleFabbers[alert.id]) { delete idleFabbers[alert.id]; rev(rev() + 1); }
        } else if (alert.watch_type === WT.ready && alert.location) {
            // a unit rolled out: any "idle" factory right there is idle no more
            var cleared = false;
            _.forEach(idleFactories, function (f, id) {
                if (!f.location) return;
                var dx = f.location.x - alert.location.x;
                var dy = f.location.y - alert.location.y;
                var dz = f.location.z - alert.location.z;
                if ((dx * dx + dy * dy + dz * dz) < 40 * 40) { delete idleFactories[id]; cleared = true; }
            });
            if (cleared) rev(rev() + 1);
        }
    }

    // Commander poll. Verified live against the engine:
    //  - getArmyUnits is army-INDEX based and must be queried PER PLANET
    //    (planetIndex -1 returns nothing);
    //  - the result is keyed by (possibly tagged) spec id — scanning keys
    //    finds own commanders even in GW coop, where the roster reports the
    //    own commander spec as null;
    //  - getUnitState returns {army, planet, pos:[x,y,z], orders, build_target}
    //    → pos is the jump location, empty orders + no build_target = IDLE.
    var cmdrIds = {};   // unit id -> {specKey} (accumulated; state poll prunes)
    function pollCommanders() {
        if (!(IS_UNITS || IS_ALLIES)) return;
        if (model.minimized()) return; // no fan-out while collapsed
        if (!window.api || typeof api.getWorldView !== 'function') return;
        var wv;
        try { wv = api.getWorldView(0); } catch (e) { return; }
        if (!wv || typeof wv.getArmyUnits !== 'function' || typeof wv.getUnitState !== 'function') return;

        // each window scans only the armies it renders
        var wanted = IS_UNITS ? 'own' : 'allied';
        var mine = _.filter(roster, function (r) {
            return r.state === wanted && !r.defeated;
        });
        if (!mine.length || planetCount < 1) return;

        var scans = 0;
        _.forEach(mine, function (r) {
            for (var p = 0; p < planetCount; p++) {
                scans++;
                wv.getArmyUnits(r.index, p).then(function (bySpec) {
                    _.forEach(bySpec || {}, function (unitIds, spec) {
                        if (!/\/commanders\/|bot_support_commander/.test(spec)) return;
                        if (!_.isArray(unitIds)) return;
                        for (var u = 0; u < unitIds.length; u++)
                            cmdrIds[unitIds[u]] = {
                                specKey: canonicalSpec(spec),
                                colonel: /bot_support_commander/.test(spec)
                            };
                    });
                    if (--scans === 0) refreshCommanderState(wv);
                }, function () {
                    if (--scans === 0) refreshCommanderState(wv);
                });
            }
        });
    }

    function refreshCommanderState(wv) {
        var ids = _.map(_.keys(cmdrIds), Number);
        if (!ids.length) { commanders = []; rev(rev() + 1); return; }
        wv.getUnitState(ids).then(function (states) {
            var next = [];
            var alive = {};
            _.forEach(states || [], function (st, i) {
                if (!st || typeof st.army !== 'number') return;
                var r = rosterByIndex[st.army];
                if (!r || r.state === 'hostile') return;
                var id = ids[i];
                alive[id] = true;
                // a colonel still being CONSTRUCTED is not on duty yet
                if (typeof st.built_frac === 'number' && st.built_frac < 1) return;
                next.push({
                    group: r.state,
                    army_id: r.id,
                    id: id,
                    colonel: !!(cmdrIds[id] && cmdrIds[id].colonel),
                    specKey: (cmdrIds[id] && cmdrIds[id].specKey) ||
                        canonicalSpec(st.unit_spec),
                    planet: (typeof st.planet === 'number') ? st.planet : null,
                    location: (_.isArray(st.pos) && st.pos.length === 3)
                        ? { x: st.pos[0], y: st.pos[1], z: st.pos[2] } : null,
                    idle: (!st.orders || st.orders.length === 0) && !st.build_target
                });
            });
            // prune dead commanders
            _.forEach(_.keys(cmdrIds), function (k) { if (!alive[k]) delete cmdrIds[k]; });
            commanders = next;
            rev(rev() + 1);
        }, function () { /* keep the previous snapshot */ });
    }

    // Idle-factory refresh rides the same poll: a factory that was given
    // work shows orders/build_target (or vanishes when dead).
    function pollIdleFactories() {
        if (!(IS_UNITS || IS_STRUCTS)) return; // units prunes fabbers, structures prunes factories
        if (model.minimized()) return; // no polling while collapsed
        var ids = _.map(_.keys(idleFactories), Number)
            .concat(_.map(_.keys(idleFabbers), Number));
        if (!ids.length) return;
        if (!window.api || typeof api.getWorldView !== 'function') return;
        var wv;
        try { wv = api.getWorldView(0); } catch (e) { return; }
        if (!wv || typeof wv.getUnitState !== 'function') return;
        wv.getUnitState(ids).then(function (states) {
            var changed = false;
            var seen = {};
            _.forEach(states || [], function (st, i) {
                // dead/unknown ids come back as a HOLLOW OBJECT (verified
                // live: never null, just no pos) — require pos to count as
                // alive, so the prune below catches killed units
                if (!st || !_.isArray(st.pos)) return;
                seen[ids[i]] = true;
                // still under construction: the engine already fired an
                // "idle" alert for it (no orders yet), but it is not idle —
                // it re-alerts once finished and actually idle
                if (typeof st.built_frac === 'number' && st.built_frac < 1) {
                    delete idleFactories[ids[i]];
                    delete idleFabbers[ids[i]];
                    changed = true;
                    return;
                }
                if ((st.orders && st.orders.length) || st.build_target) {
                    delete idleFactories[ids[i]];
                    delete idleFabbers[ids[i]];
                    changed = true;
                }
            });
            _.forEach(ids, function (id) {
                if (!seen[id]) { delete idleFactories[id]; delete idleFabbers[id]; changed = true; } // dead
            });
            if (changed) rev(rev() + 1);
        });
    }

    // ---- stuck-unit detection ---------------------------------------------
    // The pathfinder itself is engine C++ and unfixable from a mod, but a
    // stuck unit is DETECTABLE: it holds a move/patrol order while its
    // position stays put across polls. Surface those under OWN so the player
    // can jump there and re-path. Structures are excluded by spec (mobile =
    // spec has a `navigation` block, cached via the existing spec fetch).
    var STUCK_POLL_MS = 8000;
    var STUCK_MOVE_EPSILON = 2.0;   // world units of movement that count as progress
    var STUCK_STREAK = 2;           // stationary polls before a unit is "stuck"
    var STUCK_ID_CAP = 600;         // hard cap on tracked ids per cycle (perf)
    var STUCK_ORDER_TYPES = { move: true, patrol: true };

    var mobileSpec = {};            // canonical spec -> true/false/undefined(fetching)
    var stuckTrack = {};            // unit id -> {pos, streak, specKey, stuckAt}
    var stuckDismissed = {};        // unit id -> true (right-click; cleared on movement)
    var stuckRows = [];             // rendered cluster rows

    function isMobileSpec(specKey) {
        if (!specKey) return false;
        if (mobileSpec[specKey] !== undefined) return mobileSpec[specKey];
        mobileSpec[specKey] = false; // pessimistic until the fetch lands
        if (typeof $.getJSON === 'function') {
            $.getJSON('coui:/' + specKey).done(function (d) {
                // GROUND movers only: air units hover-shuffle with
                // engine-issued micro-moves that never complete, so they
                // false-positive as stuck (and cannot wall-stick anyway).
                var nav = d && d.navigation && d.navigation.type;
                mobileSpec[specKey] = !!nav && !/^(air|orbital)/.test(nav);
            });
        }
        return false;
    }

    function pollStuck() {
        if (!IS_UNITS) return;
        if (model.minimized()) return;
        if (!window.api || typeof api.getWorldView !== 'function') return;
        var wv;
        try { wv = api.getWorldView(0); } catch (e) { return; }
        if (!wv || typeof wv.getArmyUnits !== 'function' || typeof wv.getUnitState !== 'function') return;

        var own = _.find(roster, function (r) { return r.state === 'own'; });
        if (!own || planetCount < 1) return;

        var ids = [];
        var specById = {};
        var scans = planetCount;
        for (var p = 0; p < planetCount; p++) {
            wv.getArmyUnits(own.index, p).then(function (bySpec) {
                _.forEach(bySpec || {}, function (unitIds, spec) {
                    var key = canonicalSpec(spec);
                    if (!isMobileSpec(key) || !_.isArray(unitIds)) return;
                    for (var u = 0; u < unitIds.length && ids.length < STUCK_ID_CAP; u++) {
                        ids.push(unitIds[u]);
                        specById[unitIds[u]] = key;
                    }
                });
                if (--scans === 0) checkStuck(wv, ids, specById);
            }, function () {
                if (--scans === 0) checkStuck(wv, ids, specById);
            });
        }
    }

    function checkStuck(wv, ids, specById) {
        if (!ids.length) { if (stuckRows.length) { stuckRows = []; rev(rev() + 1); } return; }
        wv.getUnitState(ids).then(function (states) {
            var seen = {};
            _.forEach(states || [], function (st, i) {
                var id = ids[i];
                if (!st || !_.isArray(st.pos)) return;
                seen[id] = true;

                // still being CONSTRUCTED (built_frac < 1): a unit building
                // in a factory holds its rally move order while stationary —
                // not stuck, not trackable yet
                if (typeof st.built_frac === 'number' && st.built_frac < 1) {
                    delete stuckTrack[id];
                    return;
                }

                var moving = STUCK_ORDER_TYPES[st.orders && st.orders[0] && st.orders[0].type];
                var t = stuckTrack[id];
                if (!moving || st.build_target) {
                    // no move order — or actively BUILDING (a patrol-build
                    // fabber stands still while constructing by design):
                    // not stuck; also un-dismiss
                    delete stuckTrack[id];
                    delete stuckDismissed[id];
                    return;
                }
                if (!t) {
                    stuckTrack[id] = { pos: st.pos, streak: 0, specKey: specById[id], planet: st.planet, stuckAt: null };
                    return;
                }
                var dx = st.pos[0] - t.pos[0], dy = st.pos[1] - t.pos[1], dz = st.pos[2] - t.pos[2];
                var movedSq = dx * dx + dy * dy + dz * dz;
                if (movedSq > STUCK_MOVE_EPSILON * STUCK_MOVE_EPSILON) {
                    t.streak = 0;
                    t.stuckAt = null;
                    delete stuckDismissed[id]; // it moved; future stucks notify again
                } else {
                    t.streak++;
                    if (t.streak >= STUCK_STREAK && t.stuckAt === null) t.stuckAt = gameTime;
                }
                t.pos = st.pos;
                t.planet = st.planet;
            });
            // drop dead/unseen units
            _.forEach(_.keys(stuckTrack), function (k) {
                if (!seen[k]) { delete stuckTrack[k]; delete stuckDismissed[k]; }
            });

            // cluster stuck units by spec+planet into rows
            var clusters = {};
            _.forEach(stuckTrack, function (t, id) {
                if (t.stuckAt === null || stuckDismissed[id]) return;
                var key = (t.specKey || '?') + '@' + t.planet;
                var c = clusters[key];
                if (!c) {
                    clusters[key] = c = {
                        specKey: t.specKey, planet: t.planet, ids: [],
                        pos: t.pos, at: t.stuckAt
                    };
                }
                c.ids.push(id);
                if (t.stuckAt !== null && (c.at === null || t.stuckAt < c.at)) c.at = t.stuckAt;
            });
            stuckRows = _.values(clusters);
            rev(rev() + 1);
        });
    }

    // ---- own nuke launchers ------------------------------------------------
    // Status per launcher (verified live against getUnitState):
    //   built_frac < 1      -> the LAUNCHER is under construction ("Building")
    //   build_target set    -> it is building its missile; build_target IS the
    //                          missile's unit id, whose own built_frac is the
    //                          preparation progress ("Preparing")
    //   neither             -> missile stored ("Ready")
    // Missile counts come from ammo_fraction_change alerts (watch_type 14,
    // registered by the base game for Nuke/NukeDefense): payload carries
    // exact ammo_count/max_ammo_count. Ammo units themselves are INVISIBLE
    // to getArmyUnits and getUnitState (verified live: absent from army
    // lists, hollow {} states), so alerts are the only source — and no
    // missile build percentage exists anywhere.
    var NUKE_POLL_MS = 2000;
    var NUKE_SPEC = /\/nuke_launcher\/nuke_launcher\.json/;           // 'anti_nuke_launcher' has no '/' before 'nuke_launcher'
    var ANTI_SPEC = /\/anti_nuke_launcher\/anti_nuke_launcher\.json/;
    var UC_SPEC = /\/unit_cannon\/unit_cannon\.json/;
    var ANTI_CAPACITY = 3;  // display fallbacks until the first ammo alert
    var UC_CAPACITY = 16;   // (the unit cannon has 16 build sockets)
    var nukeRows = [];
    var ammoByUnit = {}; // launcher unit id -> {count, max} from ammo alerts

    function pollNukes() {
        if (!IS_STRUCTS) return;
        if (prefs.nukesEnabled === false) {
            if (nukeRows.length) { nukeRows = []; rev(rev() + 1); }
            return;
        }
        if (model.minimized()) return;
        if (!window.api || typeof api.getWorldView !== 'function') return;
        var wv;
        try { wv = api.getWorldView(0); } catch (e) { return; }
        if (!wv || typeof wv.getArmyUnits !== 'function' || typeof wv.getUnitState !== 'function') return;
        var own = _.find(roster, function (r) { return r.state === 'own'; });
        if (!own || planetCount < 1) return;

        var launcherIds = [];   // [{id, type}]
        var scans = planetCount;
        for (var p = 0; p < planetCount; p++) {
            wv.getArmyUnits(own.index, p).then(function (bySpec) {
                _.forEach(bySpec || {}, function (unitIds, spec) {
                    if (!_.isArray(unitIds)) return;
                    var lt = NUKE_SPEC.test(spec) ? 'nuke'
                        : ANTI_SPEC.test(spec) ? 'anti'
                            : UC_SPEC.test(spec) ? 'uc' : null;
                    if (!lt) return;
                    for (var u = 0; u < unitIds.length; u++)
                        launcherIds.push({ id: unitIds[u], type: lt });
                });
                if (--scans === 0) nukeStates(wv, launcherIds);
            }, function () {
                if (--scans === 0) nukeStates(wv, launcherIds);
            });
        }
    }

    function nukeStates(wv, launcherIds) {
        if (!launcherIds.length) {
            if (nukeRows.length) { nukeRows = []; rev(rev() + 1); }
            return;
        }
        wv.getUnitState(_.pluck(launcherIds, 'id')).then(function (states) {
            var launchers = [];
            var liveIds = {};
            _.forEach(states || [], function (st, i) {
                if (!st || !_.isArray(st.pos)) return; // dead: hollow object
                var entry = launcherIds[i];
                liveIds[entry.id] = true;
                var e = {
                    id: entry.id,
                    type: entry.type,
                    planet: (typeof st.planet === 'number') ? st.planet : null,
                    pos: st.pos,
                    specKey: canonicalSpec(st.unit_spec)
                };
                if (typeof st.built_frac === 'number' && st.built_frac < 1) {
                    e.status = 'Building';
                    e.pct = Math.floor(st.built_frac * 100);
                } else if (st.build_target) {
                    // the missile itself is INVISIBLE to getUnitState
                    // (returns {}), so no build percentage exists — the
                    // ammo alerts only report whole-missile counts
                    e.status = 'Preparing';
                } else {
                    e.status = 'Idle';
                }
                launchers.push(e);
            });
            // drop ammo records of dead launchers (and of non-launcher
            // units the ammo watch also covers, e.g. artillery)
            _.forEach(_.keys(ammoByUnit), function (k) {
                if (!liveIds[k]) delete ammoByUnit[k];
            });
            nukeRows = launchers;
            rev(rev() + 1);
        });
    }

    if (IS_UNITS) setInterval(pollStuck, STUCK_POLL_MS);
    if (IS_STRUCTS) setInterval(pollNukes, NUKE_POLL_MS);
    if (IS_UNITS || IS_ALLIES) setInterval(pollCommanders, 5000);
    if (IS_UNITS || IS_STRUCTS) setInterval(pollIdleFactories, 3000);

    if (IS_UNIT_FAMILY) {
        // pull the roster at boot (the host pushes on change, which a freshly
        // (re)loaded window would otherwise wait on)
        try {
            api.Panel.query(api.Panel.parentId, 'panel.invoke', ['paqolGetRoster'])
                .then(function (payload) {
                    if (payload) handlers.paqol_roster(payload);
                    pollCommanders();
                });
        } catch (e) { /* push path still applies */ }
    }

    function unitsRowsFor(group) {
        var out = [];
        _.forEach(commanders, function (c) {
            if (c.group !== group) return;
            out.push({
                kind: 'commander', isCommander: true, template: '',
                roleWord: c.colonel ? 'Colonel' : 'Commander',
                colonel: c.colonel, refId: c.id,
                fallbackName: 'Commander', specKey: c.specKey, army_id: c.army_id,
                idleTag: c.idle === true,
                count: 1, seenText: '',
                location: c.location,
                planet_id: (c.planet !== null && planetIdByIndex[c.planet] !== undefined)
                    ? planetIdByIndex[c.planet] : null,
                planetIndex: c.planet,
                clickable: !!(c.location || c.planet !== null)
            });
        });
        if (group === 'own') {
            var ownEntry = _.find(roster, function (r) { return r.state === 'own'; });
            _.forEach(nukeRows, function (n) {
                var name = n.type === 'anti' ? 'Anti-nuke'
                    : n.type === 'uc' ? 'Unit cannon' : 'Nuke launcher';
                var known = ammoByUnit[n.id] || null; // exact {count,max} from ammo alerts
                var label, green = false;
                if (n.status === 'Building') {
                    label = name + ' — Building' + (n.pct !== undefined ? ' ' + n.pct + '%' : '');
                } else if (n.type === 'anti' || n.type === 'uc') {
                    // both stock a COUNT of stored munitions/units
                    var max = (known && known.max) ? known.max
                        : (n.type === 'uc' ? UC_CAPACITY : ANTI_CAPACITY);
                    var cnt = known ? known.count : null;
                    label = name + ' — ' + (cnt === null ? '?' : cnt) + '/' + max +
                        (n.status === 'Preparing' && (cnt === null || cnt < max)
                            ? (n.type === 'uc' ? ' (loading)' : ' (building)') : '');
                    green = cnt !== null && cnt > 0;
                } else if (known && known.count >= (known.max || 1)) {
                    // the ammo alert is INSTANT; the poll's build_target can
                    // lag a few seconds — a full count always wins
                    label = name + ' — READY';
                    green = true;
                } else if (n.status === 'Preparing') {
                    label = name + ' — Preparing';
                } else {
                    // complete and not building = READY (per user preference,
                    // a paused-fabrication launcher reads READY too)
                    label = name + ' — READY';
                    green = true;
                }
                out.push({
                    kind: 'nuke', display: label, refId: n.id,
                    building: n.status === 'Building',
                    specKey: n.specKey, army_id: ownEntry ? ownEntry.id : undefined,
                    count: 1, seenText: '',
                    forceColor: green ? 'rgb(120,255,120)' : null,
                    location: _.isArray(n.pos) ? { x: n.pos[0], y: n.pos[1], z: n.pos[2] } : null,
                    planet_id: (n.planet !== null && planetIdByIndex[n.planet] !== undefined)
                        ? planetIdByIndex[n.planet] : null,
                    planetIndex: n.planet,
                    clickable: !!_.isArray(n.pos)
                });
            });
        }
        if (group === 'own') {
            _.forEach(stuckRows, function (c) {
                out.push({
                    kind: 'stuck', template: '__name__ stuck', refIds: c.ids,
                    fallbackName: specLabel(c.specKey), specKey: c.specKey,
                    army_id: undefined, count: c.ids.length,
                    seenText: paqolTimefmt.format(c.at),
                    location: _.isArray(c.pos) ? { x: c.pos[0], y: c.pos[1], z: c.pos[2] } : null,
                    planet_id: (c.planet !== null && planetIdByIndex[c.planet] !== undefined)
                        ? planetIdByIndex[c.planet] : null,
                    planetIndex: c.planet,
                    hostile: true,   // attention-red
                    noPrefix: true,  // ...but never 'Enemy' — these are YOURS
                    clickable: !!_.isArray(c.pos)
                });
            });
        }
        var fights = _.sortBy(_.filter(_.values(combats), function (c) { return c.group === group; }),
            function (c) { return -(c.at || 0); });
        _.forEach(fights, function (c) {
            out.push({
                kind: 'combat', display: 'In combat', refId: c.id,
                army_id: undefined, specKey: null, count: 1,
                seenText: paqolTimefmt.format(c.at),
                location: c.location, planet_id: c.planet_id,
                clickable: !!c.location
            });
        });
        if (group === 'own') {
            // idle mobile fabricators, grouped per planet
            var fabByPlanet = {};
            _.forEach(idleFabbers, function (f, id) {
                var key = String(f.planet_id);
                var c = fabByPlanet[key];
                if (!c) fabByPlanet[key] = c = { planet_id: f.planet_id, ids: [], at: f.at, location: f.location };
                c.ids.push(Number(id));
                if (f.at !== null && (c.at === null || f.at > c.at)) { c.at = f.at; c.location = f.location || c.location; }
            });
            _.forEach(fabByPlanet, function (c) {
                var pname = planetNameById[c.planet_id];
                out.push({
                    kind: 'fabbers', refIds: c.ids,
                    display: 'Idle fabbers' + (pname ? ' — ' + pname : ''),
                    specKey: null, army_id: undefined, count: c.ids.length,
                    seenText: paqolTimefmt.format(c.at),
                    location: c.location, planet_id: c.planet_id,
                    clickable: !!c.location
                });
            });
        }
        _.forEach(idleFactories, function (f, id) {
            if (f.group !== group) return;
            out.push({
                kind: 'idle', template: '__name__ idle', refId: id,
                fallbackName: f.fallbackName, specKey: f.specKey, army_id: f.army_id,
                count: 1, seenText: paqolTimefmt.format(f.at),
                location: f.location, planet_id: f.planet_id,
                clickable: !!f.location
            });
        });
        return out;
    }

    // Combat expiry lives on its own sweep (never as a side effect inside a
    // computed — evaluation order between OWN/ALLIED must not matter).
    function expireCombats() {
        if (typeof gameTime !== 'number') return;
        var changed = false;
        _.forEach(combats, function (c, id) {
            if (c.expires !== null && gameTime > c.expires) { delete combats[id]; changed = true; }
        });
        if (changed) rev(rev() + 1);
    }

    if (IS_GWINFO) {
        // static per battle: the intel gw_play persisted for the star this
        // game was launched from (store definitions are per page)
        if (paqol.store) {
            paqol.store.define('gwintel', {
                version: 1,
                defaults: {},
                validate: function () { return []; }
            });
        }
        model.rows = ko.computed(function () {
            var d = (paqol.store && paqol.store.get('gwintel')) || {};
            var out = [];
            function row(text) {
                out.push({ display: text, count: 1, seenText: '', clickable: false });
            }
            if (!d || d.enemies === undefined) {
                row('No Galactic War intel available.');
                return out;
            }
            if (d.system) row('System: ' + d.system);
            row('Planets: ' + d.planets + (d.econ !== null && d.econ !== undefined ? ' — Threat: ' + d.econ : ''));
            row('Enemies: ' + d.enemies +
                (d.commanders > d.enemies ? ' (' + d.commanders + ' commanders)' : '') +
                (_.isArray(d.enemyNames) && d.enemyNames.length ? ' — ' + d.enemyNames.join(', ') : ''));
            row('Allies: ' + d.allies);
            row('Modifiers: ' + (_.isArray(d.modifiers) && d.modifiers.length
                ? d.modifiers.join(', ') : 'none'));
            return out;
        });
    }

    if (IS_UNIT_FAMILY) {
        // one flat list per window; each role's maps only ever hold its own
        // content (polls and ingest are role-gated), so the group split is
        // all the filtering needed
        model.rows = ko.computed(function () {
            rev(); tick();
            return unitsRowsFor(IS_ALLIES ? 'allied' : 'own');
        });
        setInterval(expireCombats, 5000);
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
        if (typeof payload.army_index === 'number' && payload.ids[payload.army_index] !== undefined)
            ownArmyId = payload.ids[payload.army_index];
        colorRev(colorRev() + 1); // recolour already-rendered rows
    };

    handlers.watch_list = function (payload) {
        if (!payload || !_.isArray(payload.list)) return;
        for (var i = 0; i < payload.list.length; i++) {
            var alert = payload.list[i];
            if (!alert || typeof alert !== 'object') continue;
            // ammo status feed (nuke/anti-nuke stock) — data, not a
            // notification: never a history row
            if (window.constants && constants.watch_type &&
                alert.watch_type === constants.watch_type.ammo_fraction_change) {
                if (IS_STRUCTS) unitsIngest(alert);
                continue;
            }
            if (role === 'paqol_history') pushHistory(historyRow(alert));
            else if (IS_UNIT_FAMILY) unitsIngest(alert);
            else if (role === 'paqol_hvt') hvtIngest(alert);
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
        // the Game Info popup CLOSES (host hides the panel); the persistent
        // windows minimize
        if (IS_GWINFO) { toParent('paqolWinClose', [role]); return; }
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

    // Strategic icon atlas files encode regions by colour: YELLOW (r=g=1)
    // is the army-coloured fill, RED (g=0) is the glyph the game renders
    // black — exactly what you see zoomed out to orbit. Reproduce with an
    // SVG colour-matrix: every output channel driven by the GREEN channel
    // scaled to the army colour, so yellow -> army colour, red -> black,
    // alpha preserved. One <filter> per distinct colour, generated on demand.
    // BOUNDING INVARIANT: keyed by army colour — at most one per player.
    var tintFilters = {}; // css color -> filter element id
    function tintFilterId(color) {
        if (tintFilters[color]) return tintFilters[color];
        var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
        var r = 0.81, g = 0.88, b = 0.92; // default #cfe0ea
        if (m) { r = m[1] / 255; g = m[2] / 255; b = m[3] / 255; }
        else if (/^#/.test(color) && color.length === 7) {
            r = parseInt(color.slice(1, 3), 16) / 255;
            g = parseInt(color.slice(3, 5), 16) / 255;
            b = parseInt(color.slice(5, 7), 16) / 255;
        }
        var id = 'paqolTint' + _.size(tintFilters);
        var host = document.getElementById('paqol-tint-defs');
        if (!host) {
            host = document.createElement('div');
            host.id = 'paqol-tint-defs';
            host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
            document.body.appendChild(host);
        }
        host.innerHTML += '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
            '<filter id="' + id + '" color-interpolation-filters="sRGB">' +
            '<feColorMatrix type="matrix" values="' +
            '0 ' + r + ' 0 0 0  ' +
            '0 ' + g + ' 0 0 0  ' +
            '0 ' + b + ' 0 0 0  ' +
            '0 0 0 1 0" />' +
            '</filter></defs></svg>';
        tintFilters[color] = id;
        return id;
    }

    ko.bindingHandlers.paqolSiTint = {
        update: function (el, valueAccessor) {
            var color = ko.unwrap(valueAccessor()) || '#cfe0ea';
            var id = tintFilterId(color);
            el.style.webkitFilter = 'url(#' + id + ')';
            el.style.filter = 'url(#' + id + ')';
        }
    };

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
