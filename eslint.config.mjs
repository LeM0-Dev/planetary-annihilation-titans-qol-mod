// PA QoL — flat ESLint config.
// Two worlds: shipped mod code is ES5 (Coherent UI ≈ Chrome 40); dev tooling
// and tests are modern Node. ecmaVersion: 5 makes let/arrows/templates/class
// hard lint errors, which is most of the Chrome-40 risk; the runtime-absent
// builtins (Object.assign on plain objects etc.) are banned by
// tools/check-modinfo.mjs.
export default [
    {
        files: ['ui/mods/**/*.js'],
        languageOptions: {
            ecmaVersion: 5,
            sourceType: 'script',
            globals: {
                // browser
                window: 'readonly', document: 'readonly', console: 'readonly',
                localStorage: 'readonly', sessionStorage: 'readonly',
                setTimeout: 'readonly', setInterval: 'readonly',
                clearTimeout: 'readonly', clearInterval: 'readonly',
                XMLHttpRequest: 'readonly', Image: 'readonly',
                // PA scene globals
                model: 'readonly', handlers: 'readonly', api: 'readonly',
                engine: 'readonly', constants: 'readonly', audioModel: 'readonly',
                eventSystem: 'readonly', triggerModel: 'readonly', app: 'readonly',
                ko: 'readonly', $: 'readonly', _: 'readonly',
                loc: 'readonly', loadHtml: 'readonly', loadScript: 'readonly',
                loadCSS: 'readonly', Build: 'readonly',
                // this mod
                paqol: 'writable', paqolSchema: 'writable', paqolGeometry: 'writable',
                paqolTimefmt: 'writable', paqolRing: 'writable', paqolHvt: 'writable',
                paqolAudioArbiter: 'writable', paqolNotifyDefaults: 'writable',
                // node-test tail guard
                module: 'readonly'
            }
        },
        rules: {
            // ES5 catch clauses cannot omit the parameter; don't warn on it.
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-undef': 'error',
            'eqeqeq': ['warn', 'smart']
        }
    },
    {
        files: ['tools/**/*.mjs', 'test/**/*.mjs', 'eslint.config.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { process: 'readonly', console: 'readonly' }
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none' }]
        }
    }
];
