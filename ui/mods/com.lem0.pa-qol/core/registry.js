// PA QoL — feature registry. ES5 only.
// Adding a feature = one directory + registry.add + modinfo scene entries.
// A failing feature is disabled alone; its neighbours keep running (Rule 2).
(function () {
    'use strict';
    if (paqol.registry) return;

    var features = [];   // {id, scenes, requires, init}
    var started = {};    // 'id@scene' -> true

    paqol.registry = {
        add: function (def) {
            if (!def || typeof def.id !== 'string' || !def.id) {
                paqol.log.error('registry.add: feature is missing a string id.');
                return;
            }
            if (!_.isArray(def.scenes) || !def.scenes.length) {
                paqol.log.error('registry.add: feature "' + def.id + '" declares no scenes.');
                return;
            }
            if (typeof def.init !== 'function') {
                paqol.log.error('registry.add: feature "' + def.id + '" has no init().');
                return;
            }
            for (var i = 0; i < features.length; i++) {
                if (features[i].id === def.id) {
                    paqol.log.warn('registry.add: duplicate feature "' + def.id + '" ignored.');
                    return;
                }
            }
            features.push(def);
        },

        run: function (scene) {
            var ctx = { scene: scene };
            var ran = 0, skipped = 0, failed = 0;

            for (var i = 0; i < features.length; i++) {
                var f = features[i];
                if (_.indexOf(f.scenes, scene) === -1) continue;
                if (started[f.id + '@' + scene]) { skipped++; continue; }

                var missing = missingRequirement(f.requires);
                if (missing) {
                    paqol.log.warn('feature "' + f.id + '" disabled in scene "' + scene +
                        '": required "' + missing + '" is unavailable.');
                    skipped++;
                    continue;
                }

                try {
                    f.init(ctx);
                    started[f.id + '@' + scene] = true;
                    ran++;
                } catch (e) {
                    failed++;
                    paqol.log.error('feature "' + f.id + '" failed to initialise in scene "' +
                        scene + '"; that feature is disabled, others continue.', e);
                }
            }
            paqol.log.info('scene "' + scene + '": ' + ran + ' feature(s) started, ' +
                skipped + ' skipped, ' + failed + ' failed.');
        }
    };

    function missingRequirement(requires) {
        if (!requires) return null;
        for (var i = 0; i < requires.length; i++) {
            if (paqol.probe(requires[i]) === undefined) return requires[i];
        }
        return null;
    }
})();
