/**
 * Integration tests for the Robot WS relay.
 *
 * Spawns index.js in a child process for each scenario (so env vars take
 * effect) and exercises the WebSocket protocol with the `ws` client.
 *
 * Run:   node --test test/relay.test.mjs
 * (Requires Node 18+ for the built-in test runner.)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';
import { WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY     = path.resolve(__dirname, '..', 'index.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let nextPort = 19_000;
const pickPort = () => nextPort++;

async function startServer(env = {}) {
    const port = pickPort();
    const child = spawn(process.execPath, [ENTRY], {
        env: {
            ...process.env,
            X_ZOHO_CATALYST_LISTEN_PORT: String(port),
            ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Wait until /health responds 200 (max 3 s).
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        try {
            const ok = await new Promise((resolve) => {
                const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
                    res.resume();
                    resolve(res.statusCode === 200);
                });
                req.on('error', () => resolve(false));
                req.setTimeout(200, () => { req.destroy(); resolve(false); });
            });
            if (ok) break;
        } catch { /* retry */ }
        await sleep(50);
    }
    return {
        port,
        url: `ws://127.0.0.1:${port}/ws`,
        async stop() {
            child.kill('SIGTERM');
            await once(child, 'exit').catch(() => {});
        },
    };
}

function openWS(url, opts = {}) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, opts);
        ws.once('open',  () => resolve(ws));
        ws.once('error', reject);
    });
}

function nextMessage(ws, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('message timeout')), timeoutMs);
        ws.once('message', (data) => { clearTimeout(t); resolve(data.toString()); });
        ws.once('close',   (code, reason) => {
            clearTimeout(t);
            reject(new Error(`closed before message: ${code} ${reason}`));
        });
    });
}

function nextClose(ws, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('close timeout')), timeoutMs);
        ws.once('close', (code, reason) => {
            clearTimeout(t);
            resolve({ code, reason: reason.toString() });
        });
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('controller registers and receives a welcome with robotConnected=false', async () => {
    const srv = await startServer();
    try {
        const ws = await openWS(srv.url);
        ws.send(JSON.stringify({ type: 'controller' }));
        const msg = JSON.parse(await nextMessage(ws));
        assert.equal(msg.type, 'welcome');
        assert.equal(msg.role, 'controller');
        assert.equal(msg.robotConnected, false);
        ws.close();
    } finally { await srv.stop(); }
});

test('robot registers and controller is notified of online status', async () => {
    const srv = await startServer();
    try {
        const ctrl = await openWS(srv.url);
        ctrl.send(JSON.stringify({ type: 'controller' }));
        await nextMessage(ctrl);                              // welcome

        const robot = await openWS(srv.url);
        robot.send(JSON.stringify({ type: 'robot' }));
        await nextMessage(robot);                             // robot welcome

        const status = JSON.parse(await nextMessage(ctrl));
        assert.equal(status.type, 'status');
        assert.equal(status.robotConnected, true);

        ctrl.close(); robot.close();
    } finally { await srv.stop(); }
});

test('controller command is relayed to robot as single byte', async () => {
    const srv = await startServer();
    try {
        const robot = await openWS(srv.url);
        robot.send(JSON.stringify({ type: 'robot' }));
        await nextMessage(robot);                             // welcome

        const ctrl = await openWS(srv.url);
        ctrl.send(JSON.stringify({ type: 'controller' }));
        await nextMessage(ctrl);                              // welcome

        ctrl.send('F');
        const relayed = await nextMessage(robot);
        assert.equal(relayed, 'F');

        ctrl.close(); robot.close();
    } finally { await srv.stop(); }
});

test('robot with wrong token is rejected when ROBOT_TOKEN is set', async () => {
    const srv = await startServer({ ROBOT_TOKEN: 's3cret' });
    try {
        const ws = await openWS(srv.url);
        ws.send(JSON.stringify({ type: 'robot', token: 'WRONG' }));
        const { code } = await nextClose(ws);
        assert.equal(code, 4003);
    } finally { await srv.stop(); }
});

test('robot with correct token is accepted', async () => {
    const srv = await startServer({ ROBOT_TOKEN: 's3cret' });
    try {
        const ws = await openWS(srv.url);
        ws.send(JSON.stringify({ type: 'robot', token: 's3cret' }));
        const msg = JSON.parse(await nextMessage(ws));
        assert.equal(msg.type, 'welcome');
        assert.equal(msg.role, 'robot');
        ws.close();
    } finally { await srv.stop(); }
});

test('unregistered client is closed after registration timeout window', async () => {
    const srv = await startServer();
    try {
        const ws = await openWS(srv.url);
        // Don't send anything — server should drop us within ~5s.
        const { code } = await nextClose(ws, 7000);
        assert.equal(code, 4000);
    } finally { await srv.stop(); }
});

test('invalid commands are dropped silently (robot does not receive them)', async () => {
    const srv = await startServer();
    try {
        const robot = await openWS(srv.url);
        robot.send(JSON.stringify({ type: 'robot' }));
        await nextMessage(robot);

        const ctrl = await openWS(srv.url);
        ctrl.send(JSON.stringify({ type: 'controller' }));
        await nextMessage(ctrl);

        ctrl.send('Z');                  // invalid
        ctrl.send('F');                  // valid
        const relayed = await nextMessage(robot);
        assert.equal(relayed, 'F');      // proves Z was dropped

        ctrl.close(); robot.close();
    } finally { await srv.stop(); }
});

test('rate limit: 51st command in one second triggers an error frame', async () => {
    const srv = await startServer();
    try {
        const robot = await openWS(srv.url);
        robot.send(JSON.stringify({ type: 'robot' }));
        await nextMessage(robot);

        const ctrl = await openWS(srv.url);
        ctrl.send(JSON.stringify({ type: 'controller' }));
        await nextMessage(ctrl);

        // Drain robot messages in the background.
        let relayed = 0;
        robot.on('message', () => { relayed += 1; });

        // Watch for the error frame on the controller.
        const errFrame = new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('no error frame')), 2000);
            ctrl.on('message', (data) => {
                let m;
                try { m = JSON.parse(data.toString()); } catch { return; }
                if (m.type === 'error' && /rate limit/.test(m.message)) {
                    clearTimeout(t);
                    resolve(m);
                }
            });
        });

        // Burst 60 commands (limit is 50/sec).
        for (let i = 0; i < 60; i++) ctrl.send('F');
        const err = await errFrame;
        assert.equal(err.type, 'error');

        // Let the broker flush before we measure.
        await sleep(200);
        assert.ok(relayed <= 50, `expected <=50 relayed commands, got ${relayed}`);

        ctrl.close(); robot.close();
    } finally { await srv.stop(); }
});

test('origin allow-list rejects upgrades from a disallowed Origin header', async () => {
    const srv = await startServer({
        ALLOWED_ORIGINS: 'https://allowed.example.com',
    });
    try {
        // Bad origin -> server returns 403, ws throws.
        const bad = new WebSocket(srv.url, { origin: 'https://evil.example.com' });
        const err = await new Promise((resolve) => bad.once('error', resolve));
        assert.ok(/403|Unexpected/.test(err.message), `unexpected: ${err.message}`);

        // Good origin -> proceeds.
        const ok = await openWS(srv.url, { origin: 'https://allowed.example.com' });
        ok.send(JSON.stringify({ type: 'controller' }));
        const msg = JSON.parse(await nextMessage(ok));
        assert.equal(msg.type, 'welcome');
        ok.close();
    } finally { await srv.stop(); }
});

test('oversized payload (>4 KB) is rejected', async () => {
    const srv = await startServer();
    try {
        const ws = await openWS(srv.url);
        ws.send(JSON.stringify({ type: 'controller' }));
        await nextMessage(ws);                                // welcome

        // 5 KB payload — over the 4 KB cap → ws will terminate.
        const huge = 'A'.repeat(5 * 1024);
        ws.send(huge);
        const { code } = await nextClose(ws, 2000);
        // ws closes with 1009 (message too big) or aborts the socket entirely.
        assert.ok(code === 1009 || code === 1006, `unexpected close code ${code}`);
    } finally { await srv.stop(); }
});

test('/health endpoint reports liveness', async () => {
    const srv = await startServer();
    try {
        const body = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${srv.port}/health`, (res) => {
                let buf = '';
                res.on('data', (c) => { buf += c; });
                res.on('end',  () => resolve({ status: res.statusCode, body: buf }));
            }).on('error', reject);
        });
        assert.equal(body.status, 200);
        const j = JSON.parse(body.body);
        assert.equal(j.ok, true);
        assert.equal(j.robot, false);
        assert.equal(j.controllers, 0);
        // New: config introspection block
        assert.ok(j.config, 'health response must include config');
        assert.equal(j.config.robotToken.set, false);
        assert.equal(j.config.controllerToken.set, false);
        assert.equal(j.config.allowedOrigins, '* (open)');
    } finally { await srv.stop(); }
});

// ---------------------------------------------------------------------------
// Camera / video fanout
// ---------------------------------------------------------------------------
function nextBinary(ws, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('binary timeout')), timeoutMs);
        const onMsg = (data, isBinary) => {
            if (!isBinary) return;          // skip status JSON envelopes
            ws.off('message', onMsg);
            clearTimeout(t);
            resolve(data);
        };
        ws.on('message', onMsg);
        ws.once('close', (code, reason) => {
            clearTimeout(t);
            reject(new Error(`closed before binary: ${code} ${reason}`));
        });
    });
}

// Minimal valid JPEG (SOI + EOI markers) — enough to satisfy a non-decoding
// relay that only forwards bytes. Real cameras send ~10-30 KB frames.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
                               0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
                               0xff, 0xd9]);

test('camera registers and controller is notified that camera is online', async () => {
    const srv = await startServer();
    try {
        const ctrl = await openWS(srv.url);
        ctrl.send(JSON.stringify({ type: 'controller' }));
        const welcome = JSON.parse(await nextMessage(ctrl));
        assert.equal(welcome.cameraConnected, false);

        const cam = await openWS(srv.url);
        cam.send(JSON.stringify({ type: 'camera' }));
        await nextMessage(cam);                              // camera welcome

        const status = JSON.parse(await nextMessage(ctrl));
        assert.equal(status.type, 'status');
        assert.equal(status.cameraConnected, true);

        ctrl.close(); cam.close();
    } finally { await srv.stop(); }
});

test('binary frames from camera are fanned out verbatim to controllers', async () => {
    const srv = await startServer();
    try {
        const ctrl = await openWS(srv.url);
        ctrl.binaryType = 'nodebuffer';
        ctrl.send(JSON.stringify({ type: 'controller' }));
        await nextMessage(ctrl);                              // welcome

        const cam = await openWS(srv.url);
        cam.send(JSON.stringify({ type: 'camera' }));
        await nextMessage(cam);                              // camera welcome
        await nextMessage(ctrl);                              // status flip to cameraConnected=true

        cam.send(FAKE_JPEG, { binary: true });
        const received = await nextBinary(ctrl);
        assert.ok(Buffer.isBuffer(received));
        assert.equal(received.length, FAKE_JPEG.length);
        assert.deepEqual(received, FAKE_JPEG);

        ctrl.close(); cam.close();
    } finally { await srv.stop(); }
});

test('camera with wrong token is rejected when CAMERA_TOKEN is set', async () => {
    const srv = await startServer({ CAMERA_TOKEN: 'lens' });
    try {
        const ws = await openWS(srv.url);
        ws.send(JSON.stringify({ type: 'camera', token: 'WRONG' }));
        const { code } = await nextClose(ws);
        assert.equal(code, 4003);
    } finally { await srv.stop(); }
});

test('/video upgrade path works identically to /ws', async () => {
    const srv = await startServer();
    try {
        const videoUrl = srv.url.replace(/\/ws$/, '/video');
        const cam = await openWS(videoUrl);
        cam.send(JSON.stringify({ type: 'camera' }));
        const welcome = JSON.parse(await nextMessage(cam));
        assert.equal(welcome.type, 'welcome');
        assert.equal(welcome.role, 'camera');
        cam.close();
    } finally { await srv.stop(); }
});

test('camera disconnect flips cameraConnected=false on controllers', async () => {
    const srv = await startServer();
    try {
        const ctrl = await openWS(srv.url);
        ctrl.send(JSON.stringify({ type: 'controller' }));
        await nextMessage(ctrl);

        const cam = await openWS(srv.url);
        cam.send(JSON.stringify({ type: 'camera' }));
        await nextMessage(cam);
        const up = JSON.parse(await nextMessage(ctrl));
        assert.equal(up.cameraConnected, true);

        cam.close();
        const down = JSON.parse(await nextMessage(ctrl, 2000));
        assert.equal(down.type, 'status');
        assert.equal(down.cameraConnected, false);

        ctrl.close();
    } finally { await srv.stop(); }
});

test('/health reflects env vars when they are set (no secret leakage)', async () => {
    const srv = await startServer({
        ROBOT_TOKEN: 'abcd-efgh-ijkl',
        CONTROLLER_TOKEN: 'mnop',
        ALLOWED_ORIGINS: 'https://a.example.com,https://b.example.com',
    });
    try {
        const body = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${srv.port}/health`, (res) => {
                let buf = '';
                res.on('data', (c) => { buf += c; });
                res.on('end',  () => resolve(JSON.parse(buf)));
            }).on('error', reject);
        });
        assert.equal(body.config.robotToken.set, true);
        assert.equal(body.config.robotToken.length, 14);
        // Critical: actual secret string MUST NOT appear in the response.
        const raw = JSON.stringify(body);
        assert.ok(!raw.includes('abcd-efgh-ijkl'), 'robot token leaked');
        assert.ok(!raw.includes('mnop'),           'controller token leaked');
        assert.equal(body.config.controllerToken.set, true);
        assert.deepEqual(body.config.allowedOrigins, [
            'https://a.example.com',
            'https://b.example.com',
        ]);
    } finally { await srv.stop(); }
});
