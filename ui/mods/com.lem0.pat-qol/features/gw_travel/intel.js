// PA:T QoL — Galactic War map intel labels. ES5 only.
//
// Under every reachable, unconquered system the map shows what you would
// be jumping into:
//     Planets: X - Threat: Y     (Y = the AI's econ multiplier)
//     Enemies: Z                 (main AI + its minions + independent foes)
//     Allies: A
// The map is an EaselJS canvas (shared/js/easeljs), so labels are
// createjs.Text children of each star's scaled display container — they
// zoom with the map. Star view models appear once the campaign loads
// (model.galaxy.systems()), after mod injection, so poll briefly.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'gw_intel',
        scenes: ['gw_play'],
        requires: ['ko', '_'],
        init: function () {
            // the in-game Game Info popup (live_game) reads this: the
            // CURRENT star's intel, refreshed while the map is open, so a
            // launched battle always finds its own system's data.
            // Written as a RAW store envelope — this scene does not load
            // core/store.js, and the reader (window page) does.
            function persistIntel(d) {
                try {
                    localStorage.setItem(paqol.MOD_ID + '/gwintel',
                        JSON.stringify({ v: 1, d: d }));
                } catch (e) { /* popup will say no intel */ }
            }

            // ---- threat: GW-AI-Overhaul's own formula, reimplemented ------
            // (section_of_foreign_intelligence.js measureThreat): per-army
            // eco scaled by commander count, extra 0.4/cmdr for foes, halved
            // (or /(eco+1)) with an AI ally, buff multipliers, ×3 guardians.
            function saneEco(e) { return (typeof e === 'number' && e > 0) ? e : 1; }
            function numCommanders(c) {
                return c.bossCommanders || c.commanderCount || 1;
            }
            function ecoOf(c) {
                var eco = saneEco(c.econ_rate);
                var n = numCommanders(c);
                if (n > 1) eco = eco * ((n + 1) / 2);
                return eco;
            }
            var BUFF_MULT = { 0: 1.3, 4: 1.3, 1: 1.2, 2: 1.2, 7: 1.2, 3: 1.1, 6: 1.5 };
            var BUFF_NAME = {
                0: 'cheaper units', 1: 'damage', 2: 'health', 3: 'speed',
                4: 'build speed', 6: 'combat', 7: 'cooldown'
            };
            function threatOf(ai) {
                var total = 0;
                var all = [ai].concat(ai.minions || []).concat(ai.foes || []);
                _.forEach(all, function (c) { total += ecoOf(c); });
                _.forEach(ai.foes || [], function (army) {
                    total += saneEco(army.econ_rate) * 0.4 * (numCommanders(army) - 1);
                });
                if (ai.ally) total /= (ai.ally.econ_rate ? ai.ally.econ_rate + 1 : 2);
                _.forEach(ai.typeOfBuffs || [], function (b) {
                    total *= (BUFF_MULT[b] || 1);
                });
                if (ai.mirrorMode) total *= 3;
                return Math.round(total * 100) / 100;
            }

            function rawIntel(star) {
                var ai = star.ai && star.ai();
                if (!ai) return null;
                var planets = 0, sysName = '';
                try {
                    planets = (star.system().planets || []).length;
                    sysName = String(star.system().display_name || star.system().name || '');
                } catch (e) { }
                var armies = [ai].concat(ai.minions || []).concat(ai.foes || []);
                var names = [];
                var commanders = 0;
                _.forEach(armies, function (c) {
                    var n = numCommanders(c);
                    commanders += n;
                    names.push(c.name + (n > 1 ? ' ×' + n : ''));
                });
                var mods = [];
                if (ai.landAnywhere) mods.push('Land anywhere');
                if (ai.suddenDeath) mods.push('Sudden death');
                if (ai.bountyMode) mods.push('Bounty mode' +
                    (ai.bountyModeValue ? ' (' + ai.bountyModeValue + ')' : ''));
                if (ai.eradicationMode) {
                    // the whole point of the in-battle popup: remembering
                    // WHAT must be eradicated
                    var targets = [];
                    if (ai.eradicationModeSubCommanders) targets.push('Colonels');
                    if (ai.eradicationModeFactories) targets.push('Factories');
                    if (ai.eradicationModeFabbers) targets.push('Fabbers');
                    mods.push('Eradication mode' +
                        (targets.length ? ' — kill all ' + targets.join(', ') : ''));
                }
                if (ai.mirrorMode) mods.push('Guardians');
                _.forEach(ai.typeOfBuffs || [], function (b) {
                    mods.push('AI buff: ' + (BUFF_NAME[b] || b));
                });
                return {
                    system: sysName,
                    planets: planets,
                    econ: threatOf(ai),
                    enemies: armies.length,
                    commanders: commanders,
                    allies: (ai.ally ? 1 : 0),
                    enemyNames: names,
                    modifiers: mods
                };
            }

            function intelFor(vm) {
                var d = rawIntel(vm.star);
                if (!d) return null;
                return 'Planets: ' + d.planets + ' - Threat: ' + d.econ +
                    '\nEnemies: ' + d.enemies +
                    (d.commanders > d.enemies ? ' (' + d.commanders + ' commanders)' : '') +
                    '\nAllies: ' + d.allies;
            }

            function persistCurrent() {
                // NB: the GAME object's currentStar — model.currentStar()
                // exists but is not reliably set (found empty in solo play)
                if (!window.model || typeof model.game !== 'function' || !model.game()) return;
                var g = model.game();
                if (typeof g.currentStar !== 'function' || typeof g.galaxy !== 'function') return;
                var star = g.galaxy().stars()[g.currentStar()];
                if (!star) return;
                persistIntel(rawIntel(star) || {});
            }

            function decorate(vm) {
                if (vm.paqolIntel) return;
                vm.paqolIntel = true;
                var txt = new createjs.Text('', 'bold 26px Arial', '#ffffff');
                txt.textAlign = 'center';
                txt.y = 130;
                txt.lineHeight = 30;
                txt.shadow = new createjs.Shadow('#000000', 0, 0, 6);
                vm.systemDisplay.addChild(txt);
                ko.computed(function () {
                    // any star whose AI is still alive — conquest clears
                    // star.ai(), so labels persist on enemies you have only
                    // travelled past and vanish once beaten
                    vm.visited(); // re-evaluate on state changes
                    var t = intelFor(vm);
                    txt.visible = !!t;
                    txt.text = t || '';
                });
            }

            // galaxy loads (and can reload) after injection — keep watching,
            // same lifecycle as the travel-speed boost
            setInterval(function () {
                if (!window.model || !model.galaxy || typeof model.galaxy.systems !== 'function') return;
                if (typeof window.createjs === 'undefined') return;
                _.forEach(model.galaxy.systems() || [], decorate);
                try { persistCurrent(); } catch (e) { /* label rendering must survive */ }
            }, 1000);
        }
    });
})();

// PA:T QoL — co-op: the star's listed tech is guaranteed in the viewer's
// post-win card offer too. ES5 only.
//
// GWO's host-side co-op deal (cards_coop_deal.js) rolls each viewer a fresh
// random hand from their own inventory and ships it as the
// 'set_player_pending_tech_cards' message. The host keeps a guaranteed shot
// at the star's listed tech; the viewer historically did not. This pins the
// star's card into the viewer's offer (slot 1) so both players can plan
// routes around one tech — unless the viewer already owns it, or the deal
// is a single-card start-loadout grant (treasure planets), which stays
// untouched.
(function () {
    'use strict';

    paqol.registry.add({
        id: 'gw_coop_tech',
        scenes: ['gw_play'],
        // NB: no model.* requires — scene mods load BEFORE gw_play builds
        // its model, so those probes always fail here; everything model-
        // dependent wires lazily below.
        requires: ['_', 'ko'],
        init: function () {
            function starCardId(starIndex) {
                try {
                    var star = model.game().galaxy().stars()[starIndex];
                    var list = star && star.cardList && star.cardList();
                    return (list && list[0] && list[0].id) || null;
                } catch (e) { return null; }
            }

            function viewerOwns(clientId, clientName, cardId) {
                try {
                    var rec = model.game().findCoopPlayerInventoryData({
                        id: clientId, name: clientName
                    });
                    var cards = (rec && rec.inventory && rec.inventory.cards) || [];
                    return _.some(cards, function (c) {
                        return c === cardId || (c && c.id === cardId);
                    });
                } catch (e) { return false; }
            }

            // gw_play does not load core/store.js — read the raw envelope
            function gwPrefs() {
                try {
                    var env = JSON.parse(localStorage.getItem(paqol.MOD_ID + '/prefs') || 'null');
                    return (env && env.d) || {};
                } catch (e) { return {}; }
            }

            // ---- per-player pinned tech per star ----------------------
            // Every player's pin starts as the star's ORIGINALLY listed
            // tech. A pin re-rolls only when THAT player acquires the card
            // elsewhere — to the star's current tech if they lack it, else
            // a random unowned deck card. Persisted per campaign signature.
            var PIN_KEY = paqol.MOD_ID + '/gwpins';
            function warSig() {
                try { return String(model.getGalaxySignature()); } catch (e) { return 'war'; }
            }
            function loadAllPins() {
                try { return JSON.parse(localStorage.getItem(PIN_KEY) || '{}'); } catch (e) { return {}; }
            }
            function savePins(all) {
                // keep only a handful of campaigns
                var keys = _.keys(all);
                while (keys.length > 6) { delete all[keys.shift()]; }
                try { localStorage.setItem(PIN_KEY, JSON.stringify(all)); } catch (e) { }
            }
            function warPins(all) {
                var sig = warSig();
                if (!all[sig]) all[sig] = {};
                return all[sig];
            }
            function playerKey(r) {
                return String((r.playerId !== undefined && r.playerId !== null) ? r.playerId : r.playerName);
            }
            function recOwns(r, id) {
                return _.some((r.inventory && r.inventory.cards) || [], function (c) {
                    return c === id || (c && c.id === id);
                });
            }
            function deckIds() {
                var out = [];
                try {
                    _.forEach(model.gwoCards || [], function (c) {
                        var id = (c && c.id) || (typeof c === 'string' ? c : null);
                        // never pin start-loadout cards
                        if (id && id.indexOf('start') === -1) out.push(id);
                    });
                } catch (e) { }
                return out;
            }
            function bannedSet() {
                try {
                    var env = JSON.parse(localStorage.getItem(paqol.MOD_ID + '/gwbans') || 'null');
                    var ids = (env && env.d && env.d.ids) || [];
                    var map = {};
                    for (var i = 0; i < ids.length; i++) map[ids[i]] = true;
                    return map;
                } catch (e) { return {}; }
            }
            function regenFor(r, listed) {
                var bans = bannedSet();
                if (listed && !recOwns(r, listed) && !bans[listed]) return listed;
                var pool = _.filter(deckIds(), function (id) {
                    return !recOwns(r, id) && !bans[id];
                });
                return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
            }
            function listedAt(starIndex) {
                try {
                    var star = model.game().galaxy().stars()[starIndex];
                    var list = star && star.cardList && star.cardList();
                    return (list && list.length === 1 && list[0] && list[0].id) || null;
                } catch (e) { return null; }
            }

            // interval keeps pins initialized and regenerated
            function refreshPins() {
                if (gwPrefs().gwCoopTech === false) return;
                if (!window.model || typeof model.game !== 'function' || !model.game()) return;
                var g = model.game();
                var records = [];
                try { records = g.coopPlayerInventoryData() || []; } catch (e) { }
                if (!records.length) return;
                var stars = [];
                try { stars = g.galaxy().stars() || []; } catch (e) { return; }
                var all = loadAllPins();
                var pins = warPins(all);
                var dirty = false;
                _.forEach(stars, function (star, i) {
                    var listed = listedAt(i);
                    if (!listed) return;
                    var slot = pins[i] || (pins[i] = {});
                    _.forEach(records, function (r) {
                        var k = playerKey(r);
                        if (!slot[k]) {
                            slot[k] = listed; // snapshot the original
                            dirty = true;
                        } else if (recOwns(r, slot[k])) {
                            var re = regenFor(r, listed);
                            if (re && re !== slot[k]) { slot[k] = re; dirty = true; }
                        }
                    });
                });
                if (dirty) savePins(all);
            }
            setInterval(refreshPins, 2000);

            // ---- share the pins with modded VIEWERS -----------------------
            // Host broadcasts pins (+ player names) over the campaign
            // operator channel; a viewer running this mod stores them and
            // the Available Tech listing below renders from whichever
            // source this client has.
            var receivedPins = null; // viewer side: {pins: {star:{key:id}}, names: {key:name}}

            function broadcastPins() {
                if (gwPrefs().gwCoopTech === false) return;
                if (typeof model.sendCampaignAction !== 'function') return;
                if (typeof model.isCampaignViewer === 'function' && model.isCampaignViewer()) return;
                if (!window.model || typeof model.game !== 'function' || !model.game()) return;
                var records = [];
                try { records = model.game().coopPlayerInventoryData() || []; } catch (e) { }
                if (!records.length) return;
                var names = {};
                _.forEach(records, function (r) {
                    names[playerKey(r)] = r.playerName || ('Player ' + r.playerId);
                });
                try {
                    model.sendCampaignAction('paqol_gw_pins', {
                        pins: warPins(loadAllPins()),
                        names: names
                    });
                } catch (e) { /* viewers without the mod just ignore it */ }
            }
            setInterval(broadcastPins, 5000);



            function pinFor(clientId, clientName, starIndex) {
                try {
                    var rec = model.game().findCoopPlayerInventoryData({
                        id: clientId, name: clientName
                    });
                    if (!rec) return null;
                    var pins = warPins(loadAllPins());
                    var slot = pins[starIndex];
                    return (slot && slot[playerKey(rec)]) || null;
                } catch (e) { return null; }
            }

            function pinStarCard(payload) {
                if (gwPrefs().gwCoopTech === false) return; // user-disabled
                if (!payload || !_.isArray(payload.players)) return;
                _.forEach(payload.players, function (p) {
                    var ptc = p && p.pendingTechCards;
                    // single-card deals are start-loadout grants — hands off
                    if (!ptc || !_.isArray(ptc.cards) || ptc.cards.length < 2) return;
                    // the player's OWN pin for this star; falls back to the
                    // star's currently listed card
                    var want = pinFor(p.client_id, p.client_name, ptc.star) || starCardId(ptc.star);
                    if (!want) return;
                    if (_.some(ptc.cards, function (c) { return c && c.id === want; })) return;
                    if (viewerOwns(p.client_id, p.client_name, want)) return;
                    // Params matter: gw_inventory.canFitCard() only lets a
                    // card be picked when the hand has room OR the card
                    // carries allowOverflow (which is what upgradeDeal-style
                    // cards return from deal()). An id-only pin lost that
                    // flag and the pick button came up disabled on a full
                    // hand — a pin is a guarantee, so it always overflows.
                    ptc.cards[0] = { id: want, allowOverflow: true, unique: Math.random() };
                    paqol.log.info('co-op offer: pinned ' + want + ' for ' + p.client_name);
                });
            }

            function wrapSender(key) {
                if (typeof model[key] !== 'function') return;
                paqol.safeWrap(model, key, function (callOriginal, args) {
                    try {
                        if (args[0] === 'set_player_pending_tech_cards')
                            pinStarCard(args[1]);
                    } catch (e) { /* never break the stock deal */ }
                    return callOriginal();
                }, 'model.' + key);
            }
            // model members appear only after gw_play constructs its view
            // model — retry until each seam is wired
            var wiredSend = false, wiredCA = false, wiredReg = false;
            setInterval(function () {
                if (!window.model) return;
                if (!wiredSend && typeof model.send_message === 'function') {
                    wrapSender('send_message');
                    wiredSend = true;
                }
                if (!wiredCA && typeof model.sendCampaignAction === 'function') {
                    wrapSender('sendCampaignAction'); // GWO's fallback path
                    wiredCA = true;
                }
                if (!wiredReg && typeof model.registerCampaignViewerOperatorHandler === 'function') {
                    model.registerCampaignViewerOperatorHandler('paqol_gw_pins', function (payload) {
                        if (payload && payload.pins) receivedPins = payload;
                    });
                    wiredReg = true;
                }
            }, 1000);

            // ---- per-player listing under GWO's "Available Tech" ----------
            // For each co-op partner on record: is the selected system's
            // tech guaranteed in their offer (pinning active, not owned) or
            // will they get a plain random hand?
            function selectedStarCardId() {
                try {
                    var sys = model.selection && model.selection.system && model.selection.system();
                    var list = sys && sys.star && sys.star.cardList && sys.star.cardList();
                    return (list && list.length === 1 && list[0] && list[0].id) || null;
                } catch (e) { return null; }
            }

            // card id -> display name via the game's own card modules
            var techNames = {};
            function techName(id) {
                if (!id) return '';
                if (techNames[id] !== undefined) return techNames[id] || id;
                techNames[id] = null;
                try {
                    requireGW(['cards/' + id], function (data) {
                        techNames[id] = (data && typeof data.summarize === 'function')
                            ? String(loc(data.summarize())) : id;
                    });
                } catch (e) { techNames[id] = id; }
                return id;
            }

            function selectedStarIndex() {
                try {
                    var sys = model.selection && model.selection.system && model.selection.system();
                    return (sys && typeof sys.index === 'number') ? sys.index : null;
                } catch (e) { return null; }
            }

            function refreshPlayersTech() {
                if (typeof $ !== 'function') return;
                var $tech = $('div.td[data-bind*="gwoAvailableTech"]');
                if (!$tech.length) return; // GWO panel absent (stock GW)
                var $host = $('#paqol-tech-players');
                if (!$host.length)
                    $host = $('<div id="paqol-tech-players"></div>').insertAfter($tech);
                var records = [];
                try { records = model.game().coopPlayerInventoryData() || []; } catch (e) { }
                var cardId = selectedStarCardId();
                var starIndex = selectedStarIndex();
                if (gwPrefs().gwCoopTech === false || !cardId || starIndex === null) {
                    $host.empty();
                    return;
                }
                // VIEWER with the mod: render from the host's broadcast
                if (!records.length) {
                    if (!receivedPins || !receivedPins.pins) { $host.empty(); return; }
                    var vslot = receivedPins.pins[starIndex] || {};
                    var vhtml = '';
                    _.forEach(receivedPins.names || {}, function (nm, key) {
                        var vpin = vslot[key] || cardId;
                        vhtml += '<div class="paqol-tech-player">' +
                            _.escape(nm) + ': ' +
                            '<span style="color:#7cfc78">' + _.escape(techName(vpin)) + '</span>' +
                            (vpin !== cardId
                                ? ' <span style="color:#7f97a6">(pinned earlier — the system has re-rolled since)</span>'
                                : '') +
                            '</div>';
                    });
                    $host.html(vhtml);
                    return;
                }
                var pins = warPins(loadAllPins());
                var slot = pins[starIndex] || {};
                var html = '';
                _.forEach(records, function (r) {
                    var pin = slot[playerKey(r)] || cardId;
                    var owns = recOwns(r, pin);
                    html += '<div class="paqol-tech-player">' +
                        _.escape(r.playerName || ('Player ' + r.playerId)) + ': ' +
                        '<span style="color:#7cfc78">' + _.escape(techName(pin)) + '</span>' +
                        (pin !== cardId
                            ? ' <span style="color:#7f97a6">(pinned earlier — the system has re-rolled since)</span>'
                            : '') +
                        (owns ? ' <span style="color:#7f97a6">(owned — will re-roll)</span>' : '') +
                        '</div>';
                });
                $host.html(html);
            }
            setInterval(refreshPlayersTech, 1500);
        }
    });
})();

// PA:T QoL — Galactic War deck editor (host-side). ES5 only.
//
// Fixes misclicked card picks: edit YOUR inventory or any co-op partner's
// saved record straight from the war map. Own inventory = the live
// GWInventory (its cards observable re-applies effects on set); partners =
// their coopPlayerInventoryData record + upsert; both persisted with
// GW.manifest.saveGame. Card names resolve through the game's own card
// modules (requireGW -> summarize()). Guarded by the gwEditEnabled setting
// (default OFF).
(function () {
    'use strict';

    paqol.registry.add({
        id: 'gw_deck_editor',
        scenes: ['gw_play'],
        requires: ['_', '$', 'ko'],
        init: function () {
            function gwPrefs() {
                try {
                    var env = JSON.parse(localStorage.getItem(paqol.MOD_ID + '/prefs') || 'null');
                    return (env && env.d) || {};
                } catch (e) { return {}; }
            }

            $('<style>').text(
                '#paqol-deck-btn{position:fixed;left:50%;margin-left:-55px;bottom:185px;z-index:99999;padding:6px 14px;' +
                'background:rgba(14,18,22,0.9);border:1px solid rgba(0,179,255,0.7);color:#cfe0ea;' +
                'font-size:14px;cursor:pointer;-webkit-user-select:none}' +
                '#paqol-deck-btn:hover{background:rgba(0,179,255,0.35);color:#fff}' +
                '#paqol-deck-editor{position:fixed;left:0;top:0;right:0;bottom:0;z-index:100000;' +
                'background:rgba(0,0,0,0.55)}' +
                '.pde-box{position:absolute;left:50%;top:50%;width:80vw;height:80%;margin:0;transform:translate(-50%,-50%);-webkit-transform:translate(-50%,-50%);' +
                'background:rgb(14,18,22);border:1px solid rgba(0,179,255,0.7);color:#cfe0ea;' +
                'display:flex;flex-direction:column;font-size:17px}' +
                '.pde-title{padding:8px 10px;background:rgba(40,58,72,0.95);font-size:18px;font-weight:bold}' +
                '.pde-close{float:right;cursor:pointer;color:#9db8c8}.pde-close:hover{color:#fff}' +
                '.pde-box select{background:rgba(10,14,18,0.9);color:#cfe0ea;border:1px solid rgba(120,160,190,0.4);padding:2px 4px}' +
                '.pde-head{padding:8px 10px}' +
                '.pde-slots{margin-top:8px;font-size:15px;color:#b8d0de}' +
                '.pde-slots .pde-btn{padding:0 10px;margin-left:6px;font-size:16px}' +
                '.pde-slotn{font-weight:bold;color:#fff}' +
                '.pde-slotinfo{color:#7f97a6;font-size:13px}' +
                '.pde-slotwarn{display:none;margin-top:4px;color:#ffb86b;font-size:13px}' +
                '.pde-cards{flex:0 1 auto;overflow-y:auto;margin:0 10px;border:1px solid rgba(120,160,190,0.25);' +
                'min-height:120px;display:flex;flex-wrap:wrap;justify-content:center;align-content:flex-start;padding:6px}' +
                '.pde-card{box-sizing:border-box;width:248px;margin:6px;padding:10px;position:relative;' +
                'background:rgba(20,28,36,0.9);border:1px solid rgba(120,160,190,0.3)}' +
                '.pde-card:hover{border-color:#ff7b76}' +
                '.pde-card img{display:block;width:64px;height:64px;margin:0 auto 6px auto}' +
                '.pde-card-title{font-weight:bold;font-size:16px;text-align:center;margin-bottom:5px}' +
                '.pde-card-desc{font-size:14px;line-height:1.35;color:#b8d0de;text-align:center}' +
                '.pde-card-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
                '.pde-x{position:absolute;top:2px;right:6px;color:#d9534f;cursor:pointer;font-size:18px;' +
                'font-weight:bold;line-height:18px}.pde-x:hover{color:#ff7b76}' +
                '.pde-addrow{display:flex;padding:8px 10px;gap:0}' +
                '.pde-addrow select{flex:1;margin-right:8px}' +
                '.pde-btn{padding:3px 14px;background:rgba(40,58,72,0.9);border:1px solid rgba(120,160,190,0.4);' +
                'color:#cfe0ea;cursor:pointer}.pde-btn:hover{background:rgba(80,110,135,0.7);color:#fff}' +
                '.pde-actions{padding:8px 10px;text-align:right}' +
                '.pde-status{display:none;padding:0 10px 4px 10px;font-size:14px}' +
                '.pde-actions .pde-btn{margin-left:8px}' +
                '.pde-apply{border-color:rgba(0,179,255,0.8)}' +
                '.pde-note{padding:0 10px 8px 10px;color:#7f97a6;font-size:13px;font-style:italic}' +
                '.pde-grid-overlay{position:fixed;left:0;top:0;right:0;bottom:0;z-index:100001;background:rgba(0,0,0,0.6)}' +
                '.pde-grid-box{position:absolute;left:50%;top:50%;width:80vw;height:80%;margin-top:0;transform:translate(-50%,-50%);' +
                '-webkit-transform:translate(-50%,-50%);background:rgb(14,18,22);border:1px solid rgba(0,179,255,0.7);' +
                'color:#cfe0ea;display:flex;flex-direction:column}' +
                '.pde-grid-filters{margin:0 10px 8px 10px;display:flex;align-items:center}' +
                '.pde-pill{padding:2px 12px;margin-right:8px;border:1px solid rgba(120,160,190,0.4);' +
                'border-radius:10px;color:#9db8c8;font-size:13px;cursor:pointer;-webkit-user-select:none}' +
                '.pde-pill:hover{color:#fff;border-color:#00b3ff}' +
                '.pde-pill-on{background:rgba(0,179,255,0.3);color:#fff;border-color:#00b3ff}' +
                '.pde-sep-count{color:#7f97a6;font-weight:normal;letter-spacing:0}' +
                '.pde-grid-loadouts{margin-left:auto;color:#9db8c8;font-size:14px;-webkit-user-select:none}' +
                '.pde-grid-search{margin:10px 10px 6px 10px;padding:4px 8px;background:rgba(10,14,18,0.9);color:#cfe0ea;' +
                'border:1px solid rgba(120,160,190,0.4);font-size:14px}' +
                '.pde-grid{flex:1;overflow-y:auto;display:flex;flex-wrap:wrap;justify-content:center;align-content:flex-start;padding:0 6px 10px 6px}' +
                '.pde-grid-sep{width:100%;margin:12px 6px 4px 6px;padding-bottom:4px;color:#9db8c8;' +
                'font-size:14px;text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid rgba(0,179,255,0.35)}' +
                '.pde-tile{box-sizing:border-box;width:248px;margin:6px;padding:10px;background:rgba(20,28,36,0.9);' +
                'border:1px solid rgba(120,160,190,0.3);cursor:pointer}' +
                '.pde-tile:hover{border-color:#00b3ff;background:rgba(0,179,255,0.15)}' +
                '.pde-tile-banned{border-color:rgba(217,83,79,0.8);opacity:0.55;position:relative}' +
                '.pde-tile-banned:hover{border-color:#ff7b76;background:rgba(217,83,79,0.15)}' +
                '.pde-tile-banflag{position:absolute;top:4px;right:6px;color:#ff7b76;font-size:11px;font-weight:bold;letter-spacing:1px}' +
                '.pde-tile img{display:block;width:64px;height:64px;margin:0 auto 6px auto}' +
                '.pde-tile-title{font-weight:bold;font-size:16px;text-align:center;margin-bottom:5px}' +
                '.pde-tile-desc{font-size:14px;line-height:1.35;color:#b8d0de;text-align:center}'
            ).appendTo('head');

            // ---- ban list: banned cards never DEAL again ------------------
            // Card modules are AMD singletons: requireGW returns the same
            // object GWO's dealer holds, so wrapping module.deal() to report
            // chance 0 removes the card's weight from every future roll —
            // star cards, offers, rerolls, everyone's. Held copies keep
            // working; bans only stop future deals.
            var BAN_KEY = paqol.MOD_ID + '/gwbans';
            function loadBans() {
                try {
                    var env = JSON.parse(localStorage.getItem(BAN_KEY) || 'null');
                    var ids = (env && env.d && env.d.ids) || [];
                    var map = {};
                    for (var i = 0; i < ids.length; i++) map[ids[i]] = true;
                    return map;
                } catch (e) { return {}; }
            }
            function saveBans(map) {
                try {
                    localStorage.setItem(BAN_KEY, JSON.stringify({ v: 1, d: { ids: _.keys(map) } }));
                } catch (e) { }
            }
            function isBanned(id) { return loadBans()[id] === true; }
            var banWrapped = {};
            function enforceBan(id) {
                if (banWrapped[id]) return;
                banWrapped[id] = true;
                try {
                    requireGW(['cards/' + id], function (m) {
                        if (!m || typeof m.deal !== 'function' || m.paqolBanWrap) return;
                        var orig = m.deal;
                        m.paqolBanWrap = true;
                        m.deal = function () {
                            var r = orig.apply(this, arguments);
                            if (r && isBanned(id)) r.chance = 0; // live: unbanning restores
                            return r;
                        };
                    });
                } catch (e) { banWrapped[id] = false; }
            }
            setInterval(function () {
                _.forEach(_.keys(loadBans()), enforceBan);
            }, 3000);

            // card id -> {name, desc, icon}, resolved via the game's own
            // card modules — the same data the real pick screen renders
            var metaCache = {};
            var metaRev = ko.observable(0);
            function cardMeta(id) {
                if (metaCache[id]) return metaCache[id];
                metaCache[id] = { name: id, desc: '', icon: null };
                try {
                    requireGW(['cards/' + id], function (data) {
                        metaCache[id] = {
                            name: (data && typeof data.summarize === 'function')
                                ? String(loc(data.summarize())) : id,
                            desc: (data && typeof data.describe === 'function')
                                ? String(loc(data.describe())) : '',
                            icon: (data && typeof data.icon === 'function')
                                ? data.icon() : null
                        };
                        metaRev(metaRev() + 1);
                    });
                } catch (e) { /* keep the id-only meta */ }
                return metaCache[id];
            }
            function cardName(id) { return cardMeta(id).name; }
            function entryId(c) { return (c && c.id) || (typeof c === 'string' ? c : null); }

            // Capacity is DERIVED by the game: applyCards() resets maxCards
            // to 0 and re-applies every card's buff — start cards contribute
            // a base and gwc_add_card_slot adds +2 each. NEVER model that
            // here (an early attempt assumed 2 x slot cards and appended
            // seven bogus slot cards to "fix" a deficit that did not exist);
            // read the real number, and change it only by adding/removing
            // the slot card the game itself uses.
            var SLOT_CARD = 'gwc_add_card_slot';
            function slotCard() {
                return { id: SLOT_CARD, allowOverflow: true, unique: Math.random() };
            }
            function slotCount(list) {
                return _.filter(list, function (c) { return entryId(c) === SLOT_CARD; }).length;
            }
            // Capacity after Apply = the game's current number plus +2 for
            // every Data Bank staged in this edit that is not in the saved
            // hand yet. Only the +2 of the game's own slot card is assumed.
            function stagedCapacity(savedList) {
                var added = slotCount(working) - slotCount(savedList || []);
                return liveCapacity() + Math.max(0, added) * 2;
            }

            function liveCapacity() {
                try {
                    if (selKey === 'you') {
                        var inv = model.game().inventory();
                        return (typeof inv.maxCards === 'function') ? inv.maxCards() : 0;
                    }
                    var p = players()[_.findIndex(players(), { key: selKey })];
                    var ri = (p && p.rec && p.rec.inventory) || {};
                    return (typeof ri.maxCards === 'number') ? ri.maxCards : 0;
                } catch (e) { return 0; }
            }

            var working = null;   // array of card entries being edited
            var savedHand = [];   // the hand as stored, to spot staged changes
            var selKey = 'you';

            function players() {
                var list = [{ key: 'you', label: 'You' }];
                try {
                    // the HOST has a coop record too — 'You' already covers
                    // it (and edits the LIVE inventory, which the record
                    // snapshot would not), so skip it here
                    var ownId = (typeof model.uberId === 'function') ? model.uberId() : null;
                    _.forEach(model.game().coopPlayerInventoryData() || [], function (r, i) {
                        if (ownId !== null && ownId !== undefined &&
                            String(r.playerId) === String(ownId)) return;
                        list.push({ key: 'rec:' + i, label: r.playerName || ('Player ' + r.playerId), rec: r });
                    });
                } catch (e) { }
                return list;
            }

            function loadWorking() {
                working = [];
                try {
                    if (selKey === 'you') {
                        working = (model.game().inventory().cards() || []).slice();
                        savedHand = working.slice();
                    } else {
                        var rec = players()[_.findIndex(players(), { key: selKey })];
                        rec = rec && rec.rec;
                        working = (((rec && rec.inventory) || {}).cards || []).slice();
                        savedHand = working.slice();
                    }
                } catch (e) { }
            }

            function deckIds() {
                var ids = {};
                try {
                    _.forEach(model.gwoCards || [], function (c) {
                        var id = entryId(c) || c;
                        if (typeof id === 'string') ids[id] = true;
                    });
                } catch (e) { }
                // whatever anyone holds is also addable
                _.forEach(players(), function (p) {
                    var cards = p.key === 'you'
                        ? (function () { try { return model.game().inventory().cards(); } catch (e) { return []; } })()
                        : ((p.rec && p.rec.inventory && p.rec.inventory.cards) || []);
                    _.forEach(cards || [], function (c) {
                        var id = entryId(c);
                        if (id) ids[id] = true;
                    });
                });
                return _.keys(ids).sort();
            }

            function renderSlots($box) {
                var cap = liveCapacity();  // recomputed by the game on Apply
                $box.find('.pde-slotn').text(cap);
                $box.find('.pde-slotinfo').text(' — ' + working.length + ' cards, ' +
                    slotCount(working) + ' Additional Data Bank card(s) (+2 slots each). ' +
                    'Capacity updates when you Apply.');
                // over capacity: the panel draws only maxCards tiles, so the
                // extra cards work in battle but are invisible everywhere
                var over = working.length - stagedCapacity(savedHand);
                var $w = $box.find('.pde-slotwarn');
                if (over > 0) {
                    $w.text('⚠ ' + over + ' card(s) beyond capacity — they still apply in ' +
                        'battle but cannot be shown in the inventory panel. Press + to add a ' +
                        'Data Bank (+2 slots) so they display.').show();
                } else {
                    $w.hide();
                }
            }

            function renderCards($box) {
                renderSlots($box);
                var $list = $box.find('.pde-cards').empty();
                _.forEach(working, function (c, i) {
                    var id = entryId(c) || '?';
                    var m = cardMeta(id);
                    // sub-commander instances: show the lieutenant, not the id
                    var isMinion = (id === 'gwc_minion' && c && c.minion && c.minion.name);
                    var $t = $('<div class="pde-card"></div>').appendTo($list);
                    if (m.icon) $('<img>').attr('src', m.icon).appendTo($t);
                    $('<div class="pde-card-title"></div>')
                        .text(isMinion ? 'Sub Commander' : m.name).appendTo($t);
                    $('<div class="pde-card-desc"></div>')
                        [isMinion ? 'text' : 'html'](isMinion ? c.minion.name : m.desc)
                        .appendTo($t);
                    $('<span class="pde-x" title="Remove">✕</span>').appendTo($t)
                        .on('click', function () {
                            working.splice(i, 1);
                            renderCards($box);
                        });
                });
                if (!working.length)
                    $list.append('<div class="pde-card-desc" style="color:#7f97a6">No cards.</div>');
            }

            function openGrid($box, banMode) {
                var $g = $(
                    '<div class="pde-grid-overlay"><div class="pde-grid-box">' +
                    '<div class="pde-title">' + (banMode
                        ? 'Tech Cards — click a card to ban/unban; banned cards never appear in offers or on stars'
                        : 'Add Card') + '<span class="pde-close">✕</span></div>' +
                    '<input class="pde-grid-search" type="text" placeholder="Search cards..." />' +
                    '<div class="pde-grid-filters">' +
                    '<span class="pde-pill pde-pill-on" data-src="all">All</span>' +
                    '<span class="pde-pill" data-src="base">Base game</span>' +
                    '<span class="pde-pill" data-src="gwo">GW AI Overhaul</span>' +
                    '<span class="pde-pill" data-src="other">Other mods</span>' +
                    '<label class="pde-grid-loadouts"><input type="checkbox" class="pde-grid-showstart" /> Show loadout cards</label>' +
                    '</div>' +
                    '<div class="pde-grid"></div>' +
                    '</div></div>').appendTo(document.body);
                var $search = $g.find('.pde-grid-search');
                var $grid = $g.find('.pde-grid');
                var sub = null;
                function closeGrid() {
                    if (sub) { sub.dispose(); sub = null; }
                    $g.remove();
                }
                function renderGrid() {
                    var q = String($search.val() || '').toLowerCase();
                    var showStart = $g.find('.pde-grid-showstart').prop('checked');
                    $grid.empty();
                    function tile(id) {
                        var m = cardMeta(id);
                        var $t = $('<div class="pde-tile"></div>');
                        if (isBanned(id)) $t.addClass('pde-tile-banned');
                        if (m.icon) $('<img>').attr('src', m.icon).appendTo($t);
                        $('<div class="pde-tile-title"></div>').text(m.name).appendTo($t);
                        $('<div class="pde-tile-desc"></div>').html(m.desc).appendTo($t); // descriptions carry HTML markup
                        if (isBanned(id)) $('<div class="pde-tile-banflag">BANNED</div>').prependTo($t);
                        $t.on('click', function () {
                            if (!banMode && working) {
                                // the game never allows more cards than slots
                                // (gw_inventory canAddCard) — stage a Data
                                // Bank so the new card has somewhere to live
                                while (working.length + 1 > stagedCapacity(savedHand))
                                    working.push(slotCard());
                            }
                            if (banMode) {
                                var bans = loadBans();
                                if (bans[id]) delete bans[id];
                                else { bans[id] = true; enforceBan(id); }
                                saveBans(bans);
                                renderGrid(); // stay open, show the toggle
                                return;
                            }
                            working.push({ id: id });
                            renderCards($box);
                            closeGrid();
                        });
                        return $t;
                    }
                    function matches(id) {
                        var m = cardMeta(id);
                        return !q || (m.name + ' ' + m.desc + ' ' + id).toLowerCase().indexOf(q) !== -1;
                    }
                    // source by id convention: base game ships gwc_*, GWO
                    // ships gwaio_*; anything else is another mod's card
                    function sourceOf(id) {
                        if (id.indexOf('gwc_') === 0) return 'base';
                        if (id.indexOf('gwaio_') === 0) return 'gwo';
                        return 'other';
                    }
                    var srcFilter = $g.find('.pde-pill-on').attr('data-src') || 'all';
                    var sections = { base: [], gwo: [], other: [], loadout: [] };
                    _.forEach(deckIds(), function (id) {
                        // gwc_minion is a Sub Commander INSTANCE card — it
                        // carries a per-lieutenant payload generated at deal
                        // time; a bare id would be a broken card
                        if (id === 'gwc_minion') return;
                        if (!matches(id)) return;
                        if (/start/i.test(id)) { sections.loadout.push(id); return; }
                        var src = sourceOf(id);
                        if (srcFilter !== 'all' && src !== srcFilter) return;
                        sections[src].push(id);
                    });
                    var TITLES = { base: 'Base game', gwo: 'GW AI Overhaul', other: 'Other mods' };
                    _.forEach(['base', 'gwo', 'other'], function (src) {
                        if (!sections[src].length) return;
                        $grid.append('<div class="pde-grid-sep">' + TITLES[src] +
                            ' <span class="pde-sep-count">(' + sections[src].length + ')</span></div>');
                        _.forEach(sections[src], function (id) { $grid.append(tile(id)); });
                    });
                    // loadout cards are picked at war start, not tech —
                    // hidden unless asked for, and always their own section
                    if (showStart && sections.loadout.length) {
                        $grid.append('<div class="pde-grid-sep">Loadout cards' +
                            ' <span class="pde-sep-count">(' + sections.loadout.length + ')</span></div>');
                        _.forEach(sections.loadout, function (id) { $grid.append(tile(id)); });
                    }
                }
                sub = metaRev.subscribe(renderGrid);
                $search.on('input keyup', renderGrid);
                $g.find('.pde-grid-showstart').on('change', renderGrid);
                $g.on('click', '.pde-pill', function () {
                    $g.find('.pde-pill').removeClass('pde-pill-on');
                    $(this).addClass('pde-pill-on');
                    renderGrid();
                });
                $g.find('.pde-close').on('click', closeGrid);
                renderGrid();
                $search.focus();
            }

            function apply($box) {
                try {
                    if (selKey === 'you') {
                        // observable set -> GWInventory re-applies card
                        // effects AND recomputes capacity from the cards
                        model.game().inventory().cards(working.slice());
                        if (typeof model.cardsChanged === 'function') model.cardsChanged();
                    } else {
                        var p = players()[_.findIndex(players(), { key: selKey })];
                        if (!p || !p.rec) throw new Error('record vanished');
                        // partner writes are ASYNC (module load + applyCards):
                        // keep the dialog open and report the real outcome
                        // instead of closing on a promise nobody watched
                        status($box, 'Applying…');
                        applyToRecord(p.rec, working.slice(), function (ok, info) {
                            if (ok) {
                                status($box, 'Saved: ' + info.cards + ' cards, ' +
                                    info.maxCards + ' slots, ' + info.units + ' units, ' +
                                    info.mods + ' mods.');
                                savedHand = working.slice();
                                renderCards($box);
                            } else {
                                status($box, 'FAILED: ' + info, true);
                            }
                        });
                        return;
                    }
                    if (window.GW && GW.manifest && typeof GW.manifest.saveGame === 'function')
                        GW.manifest.saveGame(model.game());
                    paqol.log.info('deck editor: applied ' + working.length + ' cards for ' + selKey);
                    savedHand = working.slice();
                    status($box, 'Saved: ' + working.length + ' cards, ' +
                        model.game().inventory().maxCards() + ' slots.');
                    renderCards($box);
                } catch (e) {
                    paqol.log.error('deck editor apply failed: ' + e.message);
                }
            }

            // A co-op record is inert JSON: the battle config reads its
            // DERIVED mods/units (referee_coop.js -> referee_config_setup.js),
            // not its card list, and only GWInventory.applyCards() rebuilds
            // those. So run the cards through a real GWInventory and store
            // the recomputed snapshot — otherwise the partner's card list
            // changes while their actual tech does not.
            function applyToRecord(rec, cards, done) {
                done = done || function () { };
                var settled = false;
                function finish(ok, info) {
                    if (settled) return;
                    settled = true;
                    done(ok, info);
                }
                // never leave the caller hanging on a module/apply that
                // silently never calls back
                setTimeout(function () {
                    finish(false, 'timed out waiting for the inventory rebuild');
                }, 8000);
                requireGW(['shared/gw_inventory'], function (GWInventory) {
                    try {
                        var inv = new GWInventory();
                        inv.load(_.cloneDeep(rec.inventory || {}));
                        inv.cards(cards);          // triggers applyCards
                        inv.applyCards(function () {
                            try {
                                rec.inventory = ko.toJS(inv);
                                rec.updatedAt = _.now(); // viewers key their display on this
                                model.game().upsertCoopPlayerInventoryData(rec);
                                // push to a partner running this mod so their
                                // own client's copy matches (their client owns
                                // the display; the host owns battle config)
                                if (typeof model.sendCampaignAction === 'function') {
                                    model.sendCampaignAction('paqol_set_inventory', {
                                        playerId: rec.playerId,
                                        playerName: rec.playerName,
                                        record: rec
                                    });
                                }
                                if (window.GW && GW.manifest &&
                                    typeof GW.manifest.saveGame === 'function')
                                    GW.manifest.saveGame(model.game());
                                paqol.log.info('deck editor: rebuilt ' +
                                    (rec.playerName || rec.playerId) + ' inventory (' +
                                    cards.length + ' cards, ' +
                                    ((rec.inventory.mods || []).length) + ' mods)');
                                finish(true, {
                                    cards: (rec.inventory.cards || []).length,
                                    maxCards: rec.inventory.maxCards,
                                    units: (rec.inventory.units || []).length,
                                    mods: (rec.inventory.mods || []).length
                                });
                            } catch (e) {
                                paqol.log.error('deck editor: record rebuild failed: ' + e.message);
                                finish(false, e.message);
                            }
                        });
                    } catch (e) {
                        paqol.log.error('deck editor: GWInventory unavailable: ' + e.message);
                        finish(false, 'GWInventory unavailable: ' + e.message);
                    }
                });
            }

            function status($box, text, bad) {
                $box.find('.pde-status').text(text)
                    .css('color', bad ? '#ff7b76' : '#7cfc78').show();
            }

            // Viewer side: apply an inventory pushed by the host (needs the
            // mod on this client; ignored by unmodded viewers).
            var wiredInv = false;
            setInterval(function () {
                if (wiredInv || !window.model) return;
                if (typeof model.registerCampaignViewerOperatorHandler !== 'function') return;
                wiredInv = true;
                model.registerCampaignViewerOperatorHandler('paqol_set_inventory', function (payload) {
                    try {
                        var own = (typeof model.uberId === 'function') ? model.uberId() : null;
                        if (!payload || !payload.record) return;
                        if (own !== null && String(payload.playerId) !== String(own)) return;
                        if (typeof model.applyCoopPlayerInventoryRecord === 'function')
                            model.applyCoopPlayerInventoryRecord(_.cloneDeep(payload.record),
                                'paqol_deck_editor');
                    } catch (e) { paqol.log.warn('paqol_set_inventory failed: ' + e.message); }
                });
            }, 1000);

            var $overlay = null;
            function close() { if ($overlay) { $overlay.remove(); $overlay = null; } }

            function open() {
                close();
                $overlay = $(
                    '<div id="paqol-deck-editor"><div class="pde-box">' +
                    '<div class="pde-title">Deck Editor<span class="pde-close">✕</span></div>' +
                    '<div class="pde-head">Player: <select class="pde-player"></select>' +
                    '<div class="pde-slots">Card slots: <span class="pde-slotn"></span>' +
                    '<button class="pde-btn pde-slotdn">−</button>' +
                    '<button class="pde-btn pde-slotup">+</button>' +
                    '<span class="pde-slotinfo"></span><div class="pde-slotwarn"></div></div></div>' +
                    '<div class="pde-cards"></div>' +
                    '<div class="pde-addrow"><button class="pde-btn pde-addbtn" style="width:100%">Add Card…</button></div>' +
                    '<div class="pde-status"></div><div class="pde-actions"><button class="pde-btn pde-apply">Apply &amp; Save</button>' +
                    '<button class="pde-btn pde-cancel">Cancel</button></div>' +
                    '<div class="pde-note">Apply writes straight into the campaign save. A partner\'s tech takes effect in the next battle (the host builds the battle config); their own inventory PANEL only updates if they run this mod too.</div>' +
                    '</div></div>').appendTo(document.body);
                var $box = $overlay.find('.pde-box');
                var $psel = $overlay.find('.pde-player');
                _.forEach(players(), function (p) {
                    $('<option>').val(p.key).text(p.label).appendTo($psel);
                });
                selKey = 'you';
                loadWorking();
                renderCards($box);
                metaRev.subscribe(function () { renderCards($box); });
                $psel.on('change', function () {
                    selKey = $psel.val();
                    loadWorking();
                    renderCards($box);
                });
                $overlay.find('.pde-addbtn').on('click', function () { openGrid($box, false); });
                // +/- add or remove Additional Data Bank cards (the only
                // thing that actually changes capacity)
                $overlay.find('.pde-slotup').on('click', function () {
                    working.push(slotCard());
                    renderCards($box);
                });
                $overlay.find('.pde-slotdn').on('click', function () {
                    for (var i = working.length - 1; i >= 0; i--) {
                        if (entryId(working[i]) === SLOT_CARD) { working.splice(i, 1); break; }
                    }
                    renderCards($box);
                });
                $overlay.find('.pde-apply').on('click', function () { apply($box); });
                $overlay.find('.pde-cancel, .pde-close').on('click', close);
            }

            // the button follows the setting live (default OFF); the TECHS
            // label in the inventory tray always opens the card browser
            setInterval(function () {
                var want = gwPrefs().gwEditEnabled === true &&
                    window.model && typeof model.game === 'function' && model.game();
                var $btn = $('#paqol-deck-btn');
                if (want && !$btn.length) {
                    $('<div id="paqol-deck-btn">Deck Editor</div>')
                        .appendTo(document.body)
                        .on('click', open);
                } else if (!want && $btn.length) {
                    $btn.remove();
                    close();
                }
                // TECHS -> full card grid (browse + ban), no setting needed.
                // The social .bottom-bar overlay swallows clicks on the
                // label itself, so a transparent click layer rides on top,
                // repositioned to the label's rect every pass.
                var $lbl = $('.span_build_bar_tab_label').filter(function () {
                    return $(this).text().replace(/\s/g, '').toUpperCase() === 'TECHS';
                }).first();
                if ($lbl.length) {
                    var r = $lbl[0].getBoundingClientRect();
                    var $hot = $('#paqol-techs-hot');
                    if (!$hot.length) {
                        $hot = $('<div id="paqol-techs-hot" title="Browse all tech cards / manage bans"></div>')
                            .css({
                                position: 'fixed', zIndex: 99998,
                                cursor: 'pointer', background: 'transparent',
                                borderRadius: '3px'
                            })
                            .appendTo(document.body)
                            .on('mouseenter', function () {
                                $(this).css('background', 'rgba(0, 179, 255, 0.35)');
                            })
                            .on('mouseleave', function () {
                                $(this).css('background', 'transparent');
                            })
                            .on('click', function () { openGrid(null, true); });
                    }
                    $hot.css({
                        left: (r.left - 6) + 'px', top: (r.top - 4) + 'px',
                        width: (r.width + 12) + 'px', height: (r.height + 8) + 'px'
                    });
                }
            }, 2000);
        }
    });
})();
