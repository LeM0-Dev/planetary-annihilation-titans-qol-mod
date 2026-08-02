// PA QoL — settings tab (settings scene). ES5 only.
//
// The settings scene generates its TAB STRIP from api.settings.definitions
// but hardcodes the PANES per index, so a mod tab needs DOM injection. We do
// NOT touch api.settings.definitions (it round-trips through PlayFab and
// participates in the base restoreDefaults). Instead:
//   - sentinel tab index 900 (real groups are 0..7),
//   - our own <li> appended to .nav-pills (safe: Knockout's virtual foreach
//     only manages nodes between its comment markers),
//   - our own pane appended to .container_settings, bound because injection
//     runs BEFORE ko.applyBindings(model) at settings.js:493,
//   - persistence via paqol.store (localStorage), not api.settings.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'settings_tab',
        scenes: ['settings'],
        requires: ['model', 'ko', '_', 'paqolNotifyDefaults'],
        init: function () {
            var TAB_INDEX = 900;

            if ($('#paqol-settings-pane').length) {
                paqol.log.warn('settings pane already injected; skipping.');
                return;
            }
            var $pills = $('.tab_cont .tabs .nav-pills').first();
            var $container = $('.container_settings').first();
            var ok = paqol.optional(
                window.model && model.settingGroups && model.activeSettingsGroupIndex &&
                $pills.length === 1 && $container.length === 1 &&
                typeof window.loadHtml === 'function',
                'settings scene layout not as expected; PA QoL tab not added.');
            if (!ok) {
                // Never leave the screen stuck on our (now missing) tab.
                if (window.model && model.activeSettingsGroupIndex &&
                    model.activeSettingsGroupIndex() === TAB_INDEX)
                    model.activeSettingsGroupIndex(0);
                return;
            }

            paqol.SETTINGS_INDEX = TAB_INDEX;

            // ---- view model ----------------------------------------------------
            function RowVM(key, title, stored, def) {
                var self = this;
                self.key = key;
                self.title = paqol.loc(title);
                self.enabled = ko.observable(stored ? stored.enabled !== false : def.enabled);
                self.priority = ko.observable(stored && typeof stored.priority === 'number'
                    ? stored.priority : def.priority);
            }

            function PaQolSettingsModel() {
                var self = this;
                var defaults = paqolNotifyDefaults.build();
                var storedNotifications = paqol.store.get('notifications') || {};
                var prefs = paqol.store.get('prefs') || {};

                self.groups = [];
                var allRows = [];
                _.forEach(paqolNotifyDefaults.groups(), function (group) {
                    var rows = [];
                    for (var i = 0; i < group.items.length; i++) {
                        var key = group.items[i][0];
                        var row = new RowVM(key, group.items[i][1], storedNotifications[key], defaults[key]);
                        rows.push(row);
                        allRows.push(row);
                    }
                    self.groups.push({ title: paqol.loc(group.title), rows: rows });
                });

                self.historyEnabled = ko.observable(prefs.historyEnabled !== false);
                self.historyCap = ko.observable(typeof prefs.historyCap === 'number' ? prefs.historyCap : 300);
                self.hvtEnabled = ko.observable(prefs.hvtEnabled !== false);
                self.arbiterWindowMs = ko.observable(
                    typeof prefs.arbiterWindowMs === 'number' ? prefs.arbiterWindowMs : 3000);
                self.capOptions = [100, 300, 500, 1000, 2000];
                self.windowOptions = [1500, 3000, 5000, 8000];

                // per-category target toggles
                var storedTargets = prefs.hvtTargets || {};
                self.targetRows = [];
                _.forEach(paqolNotifyDefaults.hvtTargets(), function (t) {
                    self.targetRows.push({
                        key: t[0],
                        title: paqol.loc(t[1]),
                        enabled: ko.observable(storedTargets[t[0]] !== false)
                    });
                });

                var save = _.debounce(function () {
                    var notifications = {};
                    for (var i = 0; i < allRows.length; i++) {
                        notifications[allRows[i].key] = {
                            enabled: allRows[i].enabled() === true,
                            priority: Number(allRows[i].priority())
                        };
                    }
                    paqol.store.set('notifications', notifications);
                    var hvtTargets = {};
                    for (var t = 0; t < self.targetRows.length; t++)
                        hvtTargets[self.targetRows[t].key] = self.targetRows[t].enabled() === true;
                    paqol.store.set('prefs', {
                        historyEnabled: self.historyEnabled() === true,
                        historyCap: Number(self.historyCap()),
                        hvtEnabled: self.hvtEnabled() === true,
                        hvtTargets: hvtTargets,
                        arbiterWindowMs: Number(self.arbiterWindowMs())
                    });
                }, 300);

                _.forEach(allRows, function (row) {
                    row.enabled.subscribe(save);
                    row.priority.subscribe(save);
                });
                _.forEach([self.historyEnabled, self.historyCap, self.hvtEnabled,
                    self.arbiterWindowMs],
                    function (obs) { obs.subscribe(save); });
                _.forEach(self.targetRows, function (row) { row.enabled.subscribe(save); });

                self.restoreDefaults = function () {
                    _.forEach(allRows, function (row) {
                        row.enabled(defaults[row.key].enabled);
                        row.priority(defaults[row.key].priority);
                    });
                    self.historyEnabled(true);
                    self.historyCap(300);
                    self.hvtEnabled(true);
                    _.forEach(self.targetRows, function (row) { row.enabled(true); });
                    self.arbiterWindowMs(3000);
                };

                self.resetGeometry = function () {
                    paqol.store.set('ui', { panels: {} });
                    paqol.log.info('window positions reset.');
                };

                self.resetLearnedSounds = function () {
                    paqol.store.set('cuemap', { cues: {} });
                    paqol.log.info('learned sound map reset.');
                };

                // ---- search ----
                // Rows carry data-search keywords (static markup) or their
                // bound title (notification rows); a row matches on keywords
                // or visible text. Groups/sections hide when nothing inside
                // matches and their own heading does not.
                self.searchQuery = ko.observable('');

                function applyFilter() {
                    var q = String(self.searchQuery() || '').toLowerCase().replace(/^\s+|\s+$/g, '');
                    var $pane = $('#paqol-settings-pane');

                    $pane.find('[data-search]').each(function () {
                        var $row = $(this);
                        var hay = (($row.attr('data-search') || '') + ' ' + $row.text()).toLowerCase();
                        $row.toggle(!q || hay.indexOf(q) !== -1);
                    });

                    $pane.find('.paqol-settings-group, .paqol-settings-section').each(function () {
                        var $box = $(this);
                        var heading = $box.find('.paqol-settings-heading, .paqol-settings-subheading')
                            .first().text().toLowerCase();
                        var headingHit = q && heading.indexOf(q) !== -1;
                        if (headingHit) $box.find('[data-search]').show();
                        var anyRow = $box.find('[data-search]:visible').length > 0;
                        $box.toggle(!q || headingHit || anyRow);
                    });
                }
                self.searchQuery.subscribe(_.debounce(applyFilter, 150));
            }

            model.paqolSettings = new PaQolSettingsModel();

            // ---- DOM -----------------------------------------------------------
            $pills.append(loadHtml(paqol.URL + 'features/settings_tab/tab.html'));
            $container.append(loadHtml(paqol.URL + 'features/settings_tab/pane.html'));

            // The shared footer "restore defaults" button acts on
            // activeSettingsGroup(), which is undefined for index 900; route it
            // to our own reset instead so it does not muddy api.settings state.
            paqol.safeWrap(model, 'restoreGroupDefaults', function (callOriginal) {
                if (model.activeSettingsGroupIndex() === TAB_INDEX) {
                    model.paqolSettings.restoreDefaults();
                    return undefined;
                }
                return callOriginal();
            }, 'model.restoreGroupDefaults');

            // activeSettingsGroupIndex is session-persisted; never strand the
            // next page load on index 900 if the mod gets disabled.
            $(window).on('beforeunload.paqol', function () {
                if (model.activeSettingsGroupIndex() === TAB_INDEX)
                    model.activeSettingsGroupIndex(0);
            });
        }
    });
})();
