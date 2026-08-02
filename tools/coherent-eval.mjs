#!/usr/bin/env node
// Evaluate a JS expression in a running PA Coherent UI page via the remote
// debugging port (launch PA with --coherent_port=9999).
//
//   node tools/coherent-eval.mjs <page-title-or-url-substring> <expression>
//   node tools/coherent-eval.mjs --list
//
// Prints the JSON-serialized result (returnByValue).
import WebSocket from 'ws';

const HOST = process.env.COHERENT_HOST || '127.0.0.1:9999';

async function pages() {
    const res = await fetch(`http://${HOST}/json`);
    return res.json();
}

const [, , target, ...exprParts] = process.argv;

if (!target || target === '--list') {
    const list = await pages();
    for (const p of list) console.log(`${p.title}\n    ${p.url}`);
    process.exit(0);
}

const expr = exprParts.join(' ');
if (!expr) { console.error('usage: coherent-eval.mjs <page-substring> <expression>'); process.exit(2); }

const list = await pages();
const needle = target.toLowerCase();
const page = list.find((p) =>
    p.title.toLowerCase().includes(needle) || p.url.toLowerCase().includes(needle));
if (!page) {
    console.error(`no page matching "${target}". Pages:`);
    for (const p of list) console.error(`  - ${p.title}`);
    process.exit(1);
}
console.error(`[page] ${page.title}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
const timeout = setTimeout(() => { console.error('timeout'); process.exit(1); }, 10000);

ws.on('open', () => {
    ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true }
    }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id !== 1) return;
    clearTimeout(timeout);
    if (msg.error) console.error('protocol error:', JSON.stringify(msg.error));
    else if (msg.result?.wasThrown || msg.result?.exceptionDetails)
        console.error('threw:', JSON.stringify(msg.result, null, 2));
    else
        console.log(JSON.stringify(msg.result?.result?.value ?? msg.result, null, 2));
    ws.close();
    process.exit(0);
});

ws.on('error', (e) => { console.error('ws error:', e.message); process.exit(1); });
