/**
 * End-to-end smoke test:
 *   1. Spawn the WS server.
 *   2. Connect a fake robot.
 *   3. Connect a fake controller.
 *   4. Send each command and verify the robot receives the correct char.
 *   5. Disconnect, shut down, print PASS/FAIL summary.
 */
'use strict';
const { spawn } = require('child_process');
const path      = require('path');
const WebSocket = require('ws');

const SERVER = path.join(__dirname, 'server.js');
const PORT   = 8765;
const URL    = `ws://127.0.0.1:${PORT}`;

const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
});
proc.stdout.on('data', d => process.stdout.write(`[srv] ${d}`));
proc.stderr.on('data', d => process.stderr.write(`[srv-err] ${d}`));

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function open(role) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(URL);
        ws.on('open',  () => { ws.send(JSON.stringify({ type: role })); resolve(ws); });
        ws.on('error', reject);
    });
}

async function run() {
    await wait(500);

    const robot      = await open('robot');
    const controller = await open('controller');

    const received = [];
    robot.on('message', (m) => received.push(m.toString()));

    // wait for welcome/status to settle
    await wait(200);

    const cmds = ['F','B','L','R','S'];
    for (const c of cmds) { controller.send(c); await wait(60); }

    // also test JSON form
    controller.send(JSON.stringify({ cmd: 'F' }));
    await wait(200);

    // Filter only single-char commands the robot got
    const onlyCmds = received.filter(s => s.length === 1);
    const ok = JSON.stringify(onlyCmds) === JSON.stringify([...cmds, 'F']);

    console.log('\n=== RESULT ===');
    console.log('Robot received:', onlyCmds);
    console.log('Expected      :', [...cmds, 'F']);
    console.log(ok ? '✅ PASS' : '❌ FAIL');

    controller.close();
    robot.close();
    await wait(150);
    proc.kill('SIGINT');
    process.exit(ok ? 0 : 1);
}

run().catch((e) => {
    console.error('test error:', e);
    proc.kill('SIGINT');
    process.exit(1);
});
