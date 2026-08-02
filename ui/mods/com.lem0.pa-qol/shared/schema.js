// PA QoL — tiny data validator. Pure ES5, no DOM, no PA globals, node-testable.
// A spec is a function (value, path, problems) that appends problem strings.
var paqolSchema = (function () {
    'use strict';

    function isObj(v) { return v !== null && typeof v === 'object' && !isArr(v); }
    function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

    var api = {
        bool: function (v, path, problems) {
            if (typeof v !== 'boolean') problems.push(path + ': expected boolean, got ' + typeof v);
        },
        string: function (v, path, problems) {
            if (typeof v !== 'string') problems.push(path + ': expected string, got ' + typeof v);
        },
        intRange: function (min, max) {
            return function (v, path, problems) {
                if (typeof v !== 'number' || v !== Math.floor(v) || isNaN(v))
                    problems.push(path + ': expected integer, got ' + JSON.stringify(v));
                else if (v < min || v > max)
                    problems.push(path + ': ' + v + ' out of range [' + min + ',' + max + ']');
            };
        },
        // Every own key of the map must match `shape` (an object of specs).
        mapOf: function (shape) {
            return function (v, path, problems) {
                if (!isObj(v)) { problems.push(path + ': expected object'); return; }
                for (var key in v) {
                    if (!Object.prototype.hasOwnProperty.call(v, key)) continue;
                    var entry = v[key];
                    if (!isObj(entry)) { problems.push(path + '.' + key + ': expected object'); continue; }
                    for (var field in shape) {
                        if (!Object.prototype.hasOwnProperty.call(shape, field)) continue;
                        shape[field](entry[field], path + '.' + key + '.' + field, problems);
                    }
                }
            };
        },
        // Object with a fixed set of fields; unknown fields are ignored.
        object: function (shape) {
            return function (v, path, problems) {
                if (!isObj(v)) { problems.push(path + ': expected object'); return; }
                for (var field in shape) {
                    if (!Object.prototype.hasOwnProperty.call(shape, field)) continue;
                    shape[field](v[field], path + '.' + field, problems);
                }
            };
        },
        optional: function (spec) {
            return function (v, path, problems) {
                if (v === undefined) return;
                spec(v, path, problems);
            };
        },
        check: function (data, spec) {
            var problems = [];
            spec(data, '$', problems);
            return problems;
        }
    };
    return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = paqolSchema;
