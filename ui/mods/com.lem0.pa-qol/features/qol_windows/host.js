// PA QoL — floating-window HOST (live_game scene). ES5 only.
//
// live_game.html is a coordinator page: its own pixels are never composited —
// everything visible is a <panel> (engine-composited child view) or a
// <holodeck>. So each QoL window is its own <panel> element created here and
// bound via api.Panel.bindElement; the element's box IS the on-screen region
// (api/panel.js polls it and engine.call('panel.move')s the view).
//
// The window page (panels/window.js) renders content and streams cursor
// positions for drag/resize; this host owns geometry: it converts child-local
// coords (element pos + local), also tracks its OWN mousemove for when the
// cursor escapes the small child view onto the holodeck, clamps via
// paqolGeometry, persists to the 'ui' store, and pushes panel.update() so the
// composited view follows without waiting for the 200 ms poll.
(function () {
    'use strict';

    var TITLE_H = 23;

    paqol.registry.add({
        id: 'qol_windows',
        scenes: ['live_game'],
        requires: ['model', 'api.Panel.bindElement', '_'],
        init: function () {
            var prefs = paqol.store.get('prefs') || {};

            var WINDOWS = [];
            if (prefs.historyEnabled !== false)
                WINDOWS.push({ name: 'paqol_history', def: { left: 8, top: 220, width: 340, height: 300 } });
            if (prefs.hvtEnabled !== false)
                WINDOWS.push({ name: 'paqol_hvt', def: { left: 8, top: 540, width: 300, height: 220 } });

            if (!WINDOWS.length) {
                paqol.log.info('both QoL windows are disabled in settings.');
            }

            var MIN_W = 220, MIN_H = 100;
            var els = {};        // name -> element
            var minimized = {};  // name -> bool

            function viewport() { return { w: $(window).width(), h: $(window).height() }; }

            function storedGeom(name, def) {
                var ui = paqol.store.get('ui');
                var p = (ui && ui.panels && ui.panels[name]) || {};
                var g = paqolGeometry.clamp(p, viewport(),
                    { minWidth: MIN_W, minHeight: MIN_H, defaults: def });
                g.minimized = p.minimized === true;
                return g;
            }

            function save(name) {
                var el = els[name];
                if (!el) return;
                var ui = paqol.store.get('ui');
                if (!ui || !ui.panels) return;
                var prev = ui.panels[name] || {};
                ui.panels[name] = {
                    left: el.offsetLeft,
                    top: el.offsetTop,
                    width: el.offsetWidth,
                    height: minimized[name] ? (prev.height || MIN_H) : el.offsetHeight,
                    minimized: minimized[name] === true
                };
                paqol.store.set('ui', ui);
            }

            function applyGeom(name, g) {
                var el = els[name];
                if (!el) return;
                el.style.left = g.left + 'px';
                el.style.top = g.top + 'px';
                el.style.width = g.width + 'px';
                el.style.height = (minimized[name] ? TITLE_H : g.height) + 'px';
                pushRegion(name);
            }

            // Nudge the api.Panel poller so the composited view follows NOW.
            function pushRegion(name) {
                var p = api.panels && api.panels[name];
                if (p && typeof p.update === 'function') {
                    try { p.update(); } catch (e) { /* poller will catch up */ }
                }
            }

            function messageChild(name, msg, payload) {
                var p = api.panels && api.panels[name];
                if (p && typeof p.message === 'function') p.message(msg, payload);
            }

            function createWindow(w) {
                if (document.getElementById(w.name)) return;
                var el = document.createElement('panel');
                el.id = w.name;
                el.setAttribute('src', paqol.URL + 'panels/window.html');
                el.setAttribute('no-keyboard', 'true');
                el.setAttribute('yield-focus', 'true');
                el.style.position = 'absolute';
                el.style.zIndex = '500';
                document.body.appendChild(el);

                els[w.name] = el;
                var g = storedGeom(w.name, w.def);
                minimized[w.name] = g.minimized;
                applyGeom(w.name, g);

                api.Panel.bindElement(el);
                if (g.minimized)
                    _.delay(function () { messageChild(w.name, 'paqol_state', { minimized: true }); }, 2000);
            }

            _.forEach(WINDOWS, function (w) { createWindow(w); });

            // ------------------------------------------------ drag / resize
            // interaction: {name, kind, offX, offY} — offsets are the grab
            // point inside the window (drag) or unused (resize).
            var act = null;

            function beginDrag(name, localX, localY) {
                if (!els[name]) return;
                act = { name: name, kind: 'drag', offX: localX, offY: localY };
            }

            function beginResize(name) {
                if (!els[name]) return;
                act = { name: name, kind: 'resize' };
            }

            function moveTo(parentX, parentY) {
                if (!act) return;
                var el = els[act.name];
                var vp = viewport();
                if (act.kind === 'drag') {
                    var g = paqolGeometry.clamp({
                        left: parentX - act.offX,
                        top: parentY - act.offY,
                        width: el.offsetWidth,
                        height: el.offsetHeight
                    }, vp, { minWidth: MIN_W, minHeight: minimized[act.name] ? TITLE_H : MIN_H });
                    el.style.left = g.left + 'px';
                    el.style.top = g.top + 'px';
                } else {
                    var w = Math.max(MIN_W, Math.min(parentX - el.offsetLeft + 4, vp.w - el.offsetLeft));
                    var h = Math.max(MIN_H, Math.min(parentY - el.offsetTop + 4, vp.h - el.offsetTop));
                    el.style.width = w + 'px';
                    el.style.height = h + 'px';
                }
                pushRegion(act.name);
            }

            function end() {
                if (!act) return;
                save(act.name);
                act = null;
            }

            // Child-relative → parent coords (the child view's origin is the
            // element's own position).
            function childMove(name, localX, localY) {
                if (!act || act.name !== name) return;
                var el = els[name];
                moveTo(el.offsetLeft + localX, el.offsetTop + localY);
            }

            // Cursor escaped the child view: live_game's own DOM sees it.
            $(document).on('mousemove.paqolwin', function (e) {
                if (act) moveTo(e.pageX, e.pageY);
            });
            $(document).on('mouseup.paqolwin', function () { end(); });

            // ---------------------------------------------------- receivers
            // Ride handlers['panel.invoke'] — child calls arrive as
            // model.<fn>(...args).
            paqol.bus.expose('paqolWinDragStart', beginDrag);
            paqol.bus.expose('paqolWinDragMove', childMove);
            paqol.bus.expose('paqolWinDragEnd', function () { end(); });
            paqol.bus.expose('paqolWinResizeStart', function (name) { beginResize(name); });
            paqol.bus.expose('paqolWinResizeMove', childMove);
            paqol.bus.expose('paqolWinResizeEnd', function () { end(); });
            paqol.bus.expose('paqolWinToggleMin', function (name) {
                var el = els[name];
                if (!el) return;
                minimized[name] = !minimized[name];
                var ui = paqol.store.get('ui');
                var stored = (ui && ui.panels && ui.panels[name]) || {};
                el.style.height = (minimized[name] ? TITLE_H : (stored.height || 300)) + 'px';
                pushRegion(name);
                messageChild(name, 'paqol_state', { minimized: minimized[name] });
                save(name);
            });

            // Re-clamp on resolution / UI-scale changes.
            $(window).on('resize.paqolwin', function () {
                _.forEach(WINDOWS, function (w) {
                    if (!els[w.name]) return;
                    var el = els[w.name];
                    var g = paqolGeometry.clamp({
                        left: el.offsetLeft, top: el.offsetTop,
                        width: el.offsetWidth, height: el.offsetHeight
                    }, viewport(), { minWidth: MIN_W, minHeight: minimized[w.name] ? TITLE_H : MIN_H, defaults: w.def });
                    applyGeom(w.name, g);
                    save(w.name);
                });
            });

            // ----------------------------------------- local ping ownership
            // The engine sends ping alerts with army_id -1 (no sender), so a
            // teammate's ping cannot be attributed client-side. What we CAN
            // know is whether the LOCAL player is in ping command mode; the
            // history window labels ownerless pings arriving during it as
            // "You". Heuristic: an ally pinging in that same moment would be
            // mislabeled — rare enough to accept.
            if (model.mode && typeof model.mode.subscribe === 'function') {
                var sendPingMode = function (m) {
                    messageChild('paqol_history', 'paqol_local_ping_mode', {
                        active: m === 'command_ping',
                        armyId: (typeof model.armyId === 'function') ? model.armyId() : null
                    });
                };
                model.mode.subscribe(sendPingMode);
            }

            // ------------------------------------- derived event forwarding
            // nuke_ready / commander_destroyed / ... only exist as
            // processExternalUnitEvent calls inside live_game; forward the
            // resolved names to the history window.
            var watchTypeCount = window.constants ? _.size(constants.watch_type) : 15;
            paqol.safeWrap(model, 'processExternalUnitEvent', function (callOriginal, args) {
                var type = args[0];
                if (typeof type === 'number' && type >= watchTypeCount) {
                    var name = paqol.pa.eventName(type);
                    if (name) messageChild('paqol_history', 'paqol_event', { name: name });
                }
                return callOriginal();
            }, 'model.processExternalUnitEvent');

            // ------------------------------------------ widened watch lists
            // Teleporters/Catalysts/Halleys only generate sight alerts when
            // their unit types are added to the engine watch lists; widen for
            // exactly the categories the user has enabled (Settings -> PA QOL
            // -> Target window). The other categories are covered by the base
            // game's own lists already.
            var targets = prefs.hvtTargets || {};
            var extraTypes = [];
            if (targets.teleporter !== false) extraTypes.push('Teleporter');
            if (targets.catalyst !== false) extraTypes.push('ControlModule');
            if (targets.halley !== false) extraTypes.push('PlanetEngine');

            if (extraTypes.length && prefs.hvtEnabled !== false) {
                paqol.safeWrap(model, 'setupWatchList', function (callOriginal) {
                    var result = callOriginal();
                    if (window.engine && typeof engine.call === 'function') {
                        var include = ['Factory', 'Commander', 'Recon', 'Important', 'Titan']
                            .concat(extraTypes);
                        var exclude = ['Wall'];
                        engine.call('watchlist.setSightAlertTypes', JSON.stringify(include), JSON.stringify(exclude));
                        engine.call('watchlist.setDeathAlertTypes', JSON.stringify(include), JSON.stringify(exclude));
                        engine.call('watchlist.setTargetDestroyedAlertTypes', JSON.stringify(include), JSON.stringify(exclude));
                        paqol.log.info('watch lists widened (' + extraTypes.join('/') + ').');
                    }
                    return result;
                }, 'model.setupWatchList');
            }
        }
    });
})();
