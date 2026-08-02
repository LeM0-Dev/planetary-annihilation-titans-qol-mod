// PA QoL — cross-panel messaging. ES5 only.
// Rides the base game's existing handlers['panel.invoke'] (live_game.js:4839),
// so we never add a handler key and are immune to the api.Panel.ready()
// handler-name snapshot in helpers.js.
(function () {
    'use strict';
    if (paqol.bus) return;

    paqol.bus = {
        // child panel -> the owning 'game' (live_game) panel
        toGame: function (fnName, payload) {
            if (!window.api || !api.Panel || typeof api.Panel.message !== 'function') {
                paqol.log.once('bus:message', 'warn', 'api.Panel.message unavailable; message "' + fnName + '" dropped.');
                return;
            }
            api.Panel.message(api.Panel.parentId, 'panel.invoke', [fnName, payload]);
        },

        // In-page pub/sub so features can share one ingest point without
        // depending on each other. A throwing subscriber is logged and does
        // not break the other subscribers (Rule 2).
        feed: (function () {
            var topics = {};
            return {
                on: function (topic, fn) {
                    (topics[topic] || (topics[topic] = [])).push(fn);
                },
                emit: function (topic, data) {
                    var subs = topics[topic];
                    if (!subs) return;
                    for (var i = 0; i < subs.length; i++) {
                        try { subs[i](data); } catch (e) {
                            paqol.log.once('feed:' + topic + ':' + i, 'error',
                                'feed subscriber ' + i + ' for "' + topic + '" threw; skipping it.', e);
                        }
                    }
                }
            };
        })(),

        // live_game side: publish a receiver as model.<name>. Names must be
        // paqol-prefixed and never clobber an existing member.
        expose: function (name, fn) {
            paqol.invariant(name.indexOf('paqol') === 0,
                'bus.expose name must be paqol-prefixed: ' + name);
            paqol.invariant(window.model && typeof window.model === 'object',
                'bus.expose: expected the scene model to exist.');
            if (model[name] !== undefined) {
                paqol.log.warn('bus.expose: model.' + name + ' already exists; not overwriting.');
                return false;
            }
            model[name] = fn;
            return true;
        }
    };
})();
