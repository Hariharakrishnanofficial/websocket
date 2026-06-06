/**
 * ============================================================================
 *  End-to-End WebSocket Endpoint Test
 * ============================================================================
 *  Validates that the deployed relay correctly maps all required variables to
 *  the documented endpoints. Runs against any reachable relay URL.
 *
 *  Usage:
 *      node e2e-endpoint-test.mjs ws://localhost:4600
 *      node e2e-endpoint-test.mjs wss://krishnanhari-b8hfpk0w-4600.zcodeusers.in
 *      node e2e-endpoint-test.mjs wss://appsail-XYZ.development.catalystserverless.com
 *
 *  Scenarios covered (10):
 *    1. HTTP  GET  /          -> service banner JSON
 *    2. HTTP  GET  /health    -> liveness + config introspection
 *    3. WS    /ws             -> handshake succeeds
 *    4. WS    /video          -> handshake succeeds (alias path)
 *    5. Register as controller, validate welcome envelope
 *    6. Register as robot, validate welcome envelope
 *    7. Register as camera, validate welcome envelope
 *    8. Controller -> Robot command relay (F/B/L/R/S sequence)
 *    9. Camera -> Controller binary frame fanout (byte-perfect)
 *   10. Status broadcasts on robot/camera connect & disconnect
 * ============================================================================
 */

import { WebSocket } from 'ws';
import http from 'http';
import https from 'https';
import { setTimeout as sleep } from 'node:timers/promises';

const RAW = process.argv[2] || 'ws://localhost:4600';
const WS_BASE   = RAW.replace(/\/+$/, '');
const HTTP_BASE = WS_BASE.replace(/^ws/, 'http');

const ROBOT_TOKEN      = process.env.ROBOT_TOKEN      || '';
const CONTROLLER_TOKEN = process.env.CONTROLLER_TOKEN || '';
const CAMERA_TOKEN     = process.env.CAMERA_TOKEN     || '';

let pass = 0, fail = 0;
const results = [];

function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    if (ok) { pass++; console.log(`✅ ${name}`); }
    else    { fail++; console.log(`❌ ${name}  ${detail}`); }
}

function httpGet(url) {
    const client = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        const req = client.get(url, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end',  () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(new Error('http timeout')); });
    });
}

function openWS(path, opts = {}) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${WS_BASE}${path}`, { handshakeTimeout: 8000, ...opts });
        const t = setTimeout(() => { try { ws.terminate(); } catch {} reject(new Error('open timeout')); }, 8000);
        ws.once('open',  () => { clearTimeout(t); resolve(ws); });
        ws.once('error', (e) => { clearTimeout(t); reject(e); });
    });
}

function nextMessage(ws, { binary = false, timeoutMs = 2000 } = {}) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('message timeout')), timeoutMs);
        const onMsg = (data, isBinary) => {
            if (binary && !isBinary) return;     // skip non-binary frames
            if (!binary && isBinary) return;     // skip binary frames
            ws.off('message', onMsg);
            clearTimeout(t);
            resolve(binary ? data : data.toString());
        };
        ws.on('message', onMsg);
        ws.once('close', (c, r) => { clearTimeout(t); reject(new Error(`closed ${c} ${r}`)); });
    });
}

// ---------------------------------------------------------------------------
async function test1_banner() {
    try {
        const { status, body } = await httpGet(`${HTTP_BASE}/`);
        const j = JSON.parse(body);
        const ok = status === 200 && j.ok === true && j.service === 'robot-ws-relay' && j.ws === '/ws';
        record('1. GET /  banner JSON',  ok, ok ? '' : `status=${status} body=${body.slice(0,120)}`);
    } catch (e) { record('1. GET /  banner JSON', false, e.message); }
}

async function test2_health() {
    try {
        const { status, body } = await httpGet(`${HTTP_BASE}/health`);
        const j = JSON.parse(body);
        const fields = ['ok','robot','camera','controllers','uptimeSec','video','config'];
        const has = fields.every((k) => k in j);
        const cfg = j.config || {};
        const cfgFields = ['port','robotToken','controllerToken','cameraToken','allowedOrigins',
                           'maxPayloadBytes','maxVideoFrameBytes','cmdRateLimit','cmdDedupeMs','heartbeatMs'];
        const cfgHas = cfgFields.every((k) => k in cfg);
        const ok = status === 200 && j.ok === true && has && cfgHas;
        record('2. GET /health  + config introspection', ok,
            ok ? '' : `missing fields. got keys=${Object.keys(j).join(',')}`);
        if (ok) {
            console.log(`   → cmdRateLimit=${cfg.cmdRateLimit}/s   maxVideoFrame=${cfg.maxVideoFrameBytes}B   ` +
                        `heartbeatMs=${cfg.heartbeatMs}   allowedOrigins=${JSON.stringify(cfg.allowedOrigins)}`);
        }
    } catch (e) { record('2. GET /health  + config introspection', false, e.message); }
}

async function test3_ws_handshake() {
    try {
        const ws = await openWS('/ws');
        ws.close();
        record('3. WS  /ws  handshake', true);
    } catch (e) { record('3. WS  /ws  handshake', false, e.message); }
}

async function test4_video_handshake() {
    try {
        const ws = await openWS('/video');
        ws.close();
        record('4. WS  /video  handshake (alias path)', true);
    } catch (e) { record('4. WS  /video  handshake (alias path)', false, e.message); }
}

async function test5_controller_register() {
    try {
        const ws = await openWS('/ws');
        ws.send(JSON.stringify({ type: 'controller', ...(CONTROLLER_TOKEN ? { token: CONTROLLER_TOKEN } : {}) }));
        const msg = JSON.parse(await nextMessage(ws));
        const ok = msg.type === 'welcome' && msg.role === 'controller'
            && 'robotConnected' in msg && 'cameraConnected' in msg;
        record('5. Controller registration → welcome envelope', ok,
            ok ? '' : `got: ${JSON.stringify(msg)}`);
        ws.close();
    } catch (e) { record('5. Controller registration → welcome envelope', false, e.message); }
}

async function test6_robot_register() {
    try {
        const ws = await openWS('/ws');
        ws.send(JSON.stringify({ type: 'robot', ...(ROBOT_TOKEN ? { token: ROBOT_TOKEN } : {}) }));
        const msg = JSON.parse(await nextMessage(ws));
        const ok = msg.type === 'welcome' && msg.role === 'robot';
        record('6. Robot registration → welcome envelope', ok,
            ok ? '' : `got: ${JSON.stringify(msg)}`);
        ws.close();
    } catch (e) { record('6. Robot registration → welcome envelope', false, e.message); }
}

async function test7_camera_register() {
    try {
        const ws = await openWS('/video');
        ws.send(JSON.stringify({ type: 'camera', ...(CAMERA_TOKEN ? { token: CAMERA_TOKEN } : {}) }));
        const msg = JSON.parse(await nextMessage(ws));
        const ok = msg.type === 'welcome' && msg.role === 'camera';
        record('7. Camera registration → welcome envelope', ok,
            ok ? '' : `got: ${JSON.stringify(msg)}`);
        ws.close();
        await sleep(150);
    } catch (e) { record('7. Camera registration → welcome envelope', false, e.message); }
}

async function test8_command_relay() {
    let robot, ctrl;
    try {
        robot = await openWS('/ws');
        robot.send(JSON.stringify({ type: 'robot', ...(ROBOT_TOKEN ? { token: ROBOT_TOKEN } : {}) }));
        await nextMessage(robot);                                     // welcome

        ctrl = await openWS('/ws');
        ctrl.send(JSON.stringify({ type: 'controller', ...(CONTROLLER_TOKEN ? { token: CONTROLLER_TOKEN } : {}) }));
        await nextMessage(ctrl);                                      // welcome
        // Drain the status broadcast triggered by robot connect.
        nextMessage(ctrl, { timeoutMs: 500 }).catch(() => {});

        const sequence = ['F','B','L','R','S'];
        const received = [];
        const drained = new Promise((resolve) => {
            robot.on('message', (m) => {
                const s = m.toString();
                if (s.length === 1) received.push(s);
                if (received.length === sequence.length) resolve();
            });
            setTimeout(resolve, 1500);
        });
        for (const c of sequence) { ctrl.send(c); await sleep(80); }  // dedupe-friendly spacing
        await drained;

        const ok = received.length === sequence.length
                   && received.every((c, i) => c === sequence[i]);
        record('8. Controller → Robot command relay (F,B,L,R,S)', ok,
            ok ? '' : `expected ${JSON.stringify(sequence)} got ${JSON.stringify(received)}`);
    } catch (e) { record('8. Controller → Robot command relay (F,B,L,R,S)', false, e.message); }
    finally { try { ctrl?.close(); } catch {} try { robot?.close(); } catch {} await sleep(150); }
}

async function test9_camera_fanout() {
    let cam, ctrl;
    try {
        ctrl = await openWS('/ws');
        ctrl.binaryType = 'nodebuffer';
        ctrl.send(JSON.stringify({ type: 'controller', ...(CONTROLLER_TOKEN ? { token: CONTROLLER_TOKEN } : {}) }));
        await nextMessage(ctrl);                                      // welcome

        cam = await openWS('/video');
        cam.send(JSON.stringify({ type: 'camera', ...(CAMERA_TOKEN ? { token: CAMERA_TOKEN } : {}) }));
        await nextMessage(cam);                                       // welcome
        // Status frame on controller (cameraConnected=true).
        await nextMessage(ctrl, { timeoutMs: 1000 }).catch(() => {});

        const FAKE_JPEG = Buffer.from([
            0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,
            ...Array.from({length: 200}, (_, i) => i & 0xff),
            0xff,0xd9,
        ]);
        cam.send(FAKE_JPEG, { binary: true });
        const got = await nextMessage(ctrl, { binary: true, timeoutMs: 2000 });
        const ok = Buffer.isBuffer(got) && got.length === FAKE_JPEG.length && got.equals(FAKE_JPEG);
        record('9. Camera → Controller binary fanout (byte-perfect)', ok,
            ok ? `${got.length}B forwarded` : `got ${got?.length}B`);
    } catch (e) { record('9. Camera → Controller binary fanout (byte-perfect)', false, e.message); }
    finally { try { ctrl?.close(); } catch {} try { cam?.close(); } catch {} await sleep(150); }
}

async function test10_status_broadcast() {
    let ctrl, robot;
    try {
        ctrl = await openWS('/ws');
        ctrl.send(JSON.stringify({ type: 'controller', ...(CONTROLLER_TOKEN ? { token: CONTROLLER_TOKEN } : {}) }));
        const welcome = JSON.parse(await nextMessage(ctrl));

        robot = await openWS('/ws');
        robot.send(JSON.stringify({ type: 'robot', ...(ROBOT_TOKEN ? { token: ROBOT_TOKEN } : {}) }));
        await nextMessage(robot);                                     // robot welcome

        // Controller should receive a status frame: robotConnected=true.
        const up = JSON.parse(await nextMessage(ctrl, { timeoutMs: 1500 }));
        const upOk = up.type === 'status' && up.robotConnected === true;

        robot.close();
        const down = JSON.parse(await nextMessage(ctrl, { timeoutMs: 2500 }));
        const downOk = down.type === 'status' && down.robotConnected === false;

        const ok = welcome.type === 'welcome' && upOk && downOk;
        record('10. Status broadcast on robot connect/disconnect', ok,
            ok ? '' : `welcome=${JSON.stringify(welcome)} up=${JSON.stringify(up)} down=${JSON.stringify(down)}`);
    } catch (e) { record('10. Status broadcast on robot connect/disconnect', false, e.message); }
    finally { try { ctrl?.close(); } catch {} try { robot?.close(); } catch {} }
}

// ---------------------------------------------------------------------------
(async () => {
    console.log(`\n🔌 E2E WebSocket Endpoint Test`);
    console.log(`   target = ${WS_BASE}`);
    console.log(`   http   = ${HTTP_BASE}`);
    console.log(`   tokens = robot:${ROBOT_TOKEN ? 'set' : 'unset'}  controller:${CONTROLLER_TOKEN ? 'set' : 'unset'}  camera:${CAMERA_TOKEN ? 'set' : 'unset'}\n`);

    await test1_banner();
    await test2_health();
    await test3_ws_handshake();
    await test4_video_handshake();
    await test5_controller_register();
    await test6_robot_register();
    await test7_camera_register();
    await test8_command_relay();
    await test9_camera_fanout();
    await test10_status_broadcast();

    console.log(`\n────────────────────────────────────────`);
    console.log(`  PASS ${pass}   FAIL ${fail}   TOTAL ${pass + fail}`);
    console.log(`────────────────────────────────────────\n`);
    process.exit(fail === 0 ? 0 : 1);
})();
