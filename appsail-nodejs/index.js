/**
 * ============================================================================
 *  Robot Control AppSail Service
 * ============================================================================
 *  Deployed on Zoho Catalyst AppSail. Acts as a low-latency message broker
 *  between browser-based Controller(s) (React/Slate) and an ESP32 Robot.
 *
 *  Catalyst AppSail requirements honoured:
 *    - Listens on $X_ZOHO_CATALYST_LISTEN_PORT (with 9000 fallback for local).
 *    - Single HTTP listener also hosts the WebSocket upgrade (works behind
 *      Catalyst's reverse proxy which supports the WebSocket protocol).
 *    - Stateless, single-process, no external dependencies besides express+ws.
 *
 *  Protocol:
 *    - Every client MUST send its first message as a JSON registration:
 *          {"type":"controller"[,"token":"..."]}   OR
 *          {"type":"robot"[,"token":"..."]}       OR
 *          {"type":"camera"[,"token":"..."]}
 *    - After registration, the Controller sends single-character commands
 *      (F | B | L | R | S) which are forwarded verbatim to the Robot.
 *    - A Camera client streams JPEG frames as WebSocket BINARY messages.
 *      The relay fans them out to all connected Controllers (1:N).
 *      Frames over MAX_VIDEO_FRAME_BYTES (default 96 KB) are dropped.
 *
 *  Security:
 *    - Optional Origin allow-list  -> ALLOWED_ORIGINS  (comma-sep)
 *    - Optional shared-secret auth -> ROBOT_TOKEN, CONTROLLER_TOKEN
 *    - Per-controller rate limit   -> CMD_RATE_LIMIT msgs/sec
 *    - Hard payload cap            -> MAX_PAYLOAD (4 KB)
 *
 *  Endpoints:
 *    GET  /          -> service banner (JSON)
 *    GET  /health    -> liveness probe
 *    WS   /ws        -> WebSocket endpoint (preferred path)
 *    WS   /          -> WebSocket endpoint (also accepted for convenience)
 * ============================================================================
 */

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT             = process.env.X_ZOHO_CATALYST_LISTEN_PORT || 9000;
const VALID_COMMANDS   = new Set(['F', 'B', 'L', 'R', 'S']);
const HEARTBEAT_MS     = 30_000;        // keep-alive ping every 30s
const REGISTER_TIMEOUT = 5_000;         // drop clients that don't register in 5s
// MAX_PAYLOAD must accommodate the largest expected video frame, since `ws`
// applies it uniformly to every client on this server. The per-role caps
// below (MAX_CMD_PAYLOAD / MAX_VIDEO_FRAME_BYTES) enforce tighter limits
// after the frame is received.
const MAX_VIDEO_FRAME_BYTES = parseInt(process.env.MAX_VIDEO_FRAME_BYTES || '98304', 10); // 96 KB default
const MAX_CMD_PAYLOAD       = 4 * 1024;                                          // 4 KB for cmd/telemetry frames
const MAX_PAYLOAD           = Math.max(MAX_VIDEO_FRAME_BYTES + 2048, MAX_CMD_PAYLOAD);
const CMD_RATE_LIMIT   = 50;            // max commands per second per controller
// Server-side dedupe window: if a controller resends the *same* command
// within this many ms, the relay silently drops it before forwarding to
// the robot. This is a safety net for stale/legacy clients that still spam
// commands on every keyboard auto-repeat. Set to 0 to disable.
const CMD_DEDUPE_MS    = 200;

// Optional shared secrets (set via Catalyst env vars). Empty string = disabled.
const ROBOT_TOKEN      = process.env.ROBOT_TOKEN      || '';
const CONTROLLER_TOKEN = process.env.CONTROLLER_TOKEN || '';
const CAMERA_TOKEN     = process.env.CAMERA_TOKEN     || '';

// Origin allow-list. Comma-separated env var, e.g.
//   ALLOWED_ORIGINS="https://app.example.com,http://localhost:4800"
// Empty / unset = allow any origin (dev-friendly default).
const ALLOWED_ORIGINS = new Set(
    (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
);

function isOriginAllowed(origin) {
    if (ALLOWED_ORIGINS.size === 0) return true;    // open mode
    if (!origin) return true;                       // non-browser clients (ESP32)
    return ALLOWED_ORIGINS.has(origin);
}

// ---------------------------------------------------------------------------
// Config introspection (never leaks secrets — only their presence + length)
// ---------------------------------------------------------------------------
function describeSecret(name, value) {
    if (!value) return { set: false };
    return { set: true, length: value.length };
}

const CONFIG_SUMMARY = {
    port: PORT,
    robotToken:      describeSecret('ROBOT_TOKEN',      ROBOT_TOKEN),
    controllerToken: describeSecret('CONTROLLER_TOKEN', CONTROLLER_TOKEN),
    cameraToken:     describeSecret('CAMERA_TOKEN',     CAMERA_TOKEN),
    allowedOrigins:  ALLOWED_ORIGINS.size === 0
        ? '* (open)'
        : Array.from(ALLOWED_ORIGINS),
    maxPayloadBytes:      MAX_PAYLOAD,
    maxVideoFrameBytes:   MAX_VIDEO_FRAME_BYTES,
    cmdRateLimit:    CMD_RATE_LIMIT,
    cmdDedupeMs:     CMD_DEDUPE_MS,
    heartbeatMs:     HEARTBEAT_MS,
};

// Loud, easy-to-grep startup banner so misconfiguration is obvious in logs.
function logStartupConfig() {
    log('--- effective config ---');
    log(`  PORT             = ${CONFIG_SUMMARY.port}`);
    log(`  ROBOT_TOKEN      = ${CONFIG_SUMMARY.robotToken.set
        ? `set (${CONFIG_SUMMARY.robotToken.length} chars)`
        : 'UNSET  (auth disabled — anyone can register as robot)'}`);
    log(`  CONTROLLER_TOKEN = ${CONFIG_SUMMARY.controllerToken.set
        ? `set (${CONFIG_SUMMARY.controllerToken.length} chars)`
        : 'UNSET  (auth disabled — anyone can register as controller)'}`);
    log(`  ALLOWED_ORIGINS  = ${typeof CONFIG_SUMMARY.allowedOrigins === 'string'
        ? CONFIG_SUMMARY.allowedOrigins
        : CONFIG_SUMMARY.allowedOrigins.join(', ')}`);
    log('------------------------');

    // Soft warnings for foot-guns
    if (process.env.NODE_ENV === 'production') {
        if (!ROBOT_TOKEN)      log('WARN  ROBOT_TOKEN is empty in production.');
        if (!CONTROLLER_TOKEN) log('WARN  CONTROLLER_TOKEN is empty in production.');
        if (ALLOWED_ORIGINS.size === 0) log('WARN  ALLOWED_ORIGINS is empty in production — any browser origin can connect.');
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const controllers = new Set();   // multiple controllers allowed
let   robot       = null;        // single active robot connection
let   camera      = null;        // single active camera connection

// Video stats — counters reset every second by the stats timer below.
const videoStats = {
    framesIn:        0,    // frames received from the camera (this 1-s window)
    framesOut:       0,    // frame fanouts to controllers (this 1-s window)
    bytesIn:         0,
    framesDropped:   0,    // frames dropped due to size cap or back-pressure
    lastFrameAt:     0,
    // Smoothed (last completed second) values for /health introspection.
    fpsIn:           0,
    fpsOut:          0,
    kbpsIn:          0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ts  = () => new Date().toISOString();
const log = (...args) => console.log(`[${ts()}]`, ...args);

function safeSend(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); } catch (err) {
            log('send error:', err.message);
        }
    }
}

function broadcastToControllers(payload) {
    for (const c of controllers) safeSend(c, payload);
}

function notifyRobotStatus() {
    broadcastToControllers(JSON.stringify({
        type: 'status',
        robotConnected:  robot  !== null,
        cameraConnected: camera !== null,
    }));
}

/**
 * Fan out a binary video frame to every controller.
 *
 * Back-pressure policy:
 *   - If a controller's send buffer is already over MAX_VIDEO_FRAME_BYTES,
 *     we skip that frame for that client (i.e. we drop, not queue). This
 *     keeps the live stream live — buffering would only grow latency.
 *   - We pass `{ binary: true }` so the WebSocket frame is sent as binary
 *     (the browser will decode via createImageBitmap directly).
 */
function fanoutFrameToControllers(frame) {
    let sent = 0;
    let dropped = 0;
    for (const c of controllers) {
        if (!c || c.readyState !== WebSocket.OPEN) continue;
        // bufferedAmount is bytes still queued in the kernel/socket. If we
        // are already behind, drop this frame for this client. Driving on
        // a stale feed is worse than skipping one frame.
        if (c.bufferedAmount > MAX_VIDEO_FRAME_BYTES) {
            dropped += 1;
            continue;
        }
        try {
            c.send(frame, { binary: true });
            sent += 1;
        } catch (err) {
            log('video send error:', err.message);
        }
    }
    videoStats.framesOut    += sent;
    videoStats.framesDropped += dropped;
}

// Roll up per-second stats and emit a periodic status frame to controllers
// so the UI can show a "camera healthy" indicator without polling /health.
setInterval(() => {
    videoStats.fpsIn  = videoStats.framesIn;
    videoStats.fpsOut = videoStats.framesOut > 0 && controllers.size > 0
        ? Math.round(videoStats.framesOut / controllers.size)
        : 0;
    videoStats.kbpsIn = Math.round((videoStats.bytesIn * 8) / 1024);
    // reset windowed counters
    videoStats.framesIn  = 0;
    videoStats.framesOut = 0;
    videoStats.bytesIn   = 0;
}, 1000).unref?.();

// ---------------------------------------------------------------------------
// Express HTTP app
// ---------------------------------------------------------------------------
const app = express();

app.get('/', (_req, res) => {
    res.json({
        service: 'robot-ws-relay',
        ok: true,
        robotConnected:  robot  !== null,
        cameraConnected: camera !== null,
        controllers: controllers.size,
        ws: '/ws',
    });
});

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        robot:  robot  !== null,
        camera: camera !== null,
        controllers: controllers.size,
        uptimeSec: Math.round(process.uptime()),
        video: {
            fpsIn:        videoStats.fpsIn,
            fpsOut:       videoStats.fpsOut,
            kbpsIn:       videoStats.kbpsIn,
            lastFrameAgoMs: videoStats.lastFrameAt
                ? Date.now() - videoStats.lastFrameAt
                : null,
            framesDropped1s: videoStats.framesDropped,
        },
        config: CONFIG_SUMMARY,   // safe: secrets shown only as {set,length}
    });
});

const httpServer = http.createServer(app);

// ---------------------------------------------------------------------------
// WebSocket server (noServer mode -> we route by upgrade path)
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url || '/';
    const origin = req.headers.origin;

    // Reject paths we don't serve. /video is an alias of /ws — both endpoints
    // speak the same JSON-registration protocol; the path is purely cosmetic
    // so an ESP32-CAM URL can read as wss://.../video.
    const pathOk = url === '/' || url === '/ws' || url.startsWith('/ws?')
        || url === '/video' || url.startsWith('/video?');
    if (!pathOk) { socket.destroy(); return; }

    // Reject disallowed browser origins. Non-browser clients (ESP32, curl)
    // send no Origin header and are permitted through.
    if (!isOriginAllowed(origin)) {
        log(`upgrade rejected: origin "${origin}" not in allow-list`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------
wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ws.role    = null;
    ws.isAlive = true;

    log(`new connection from ${ip} (awaiting registration)`);

    // Disconnect clients that never identify themselves
    const registerTimer = setTimeout(() => {
        if (!ws.role) {
            log(`registration timeout for ${ip} - closing`);
            try { ws.close(4000, 'registration timeout'); } catch { /* noop */ }
        }
    }, REGISTER_TIMEOUT);

    // -------- message handling --------
    ws.on('message', (raw, isBinary) => {
        // ---- First message: registration JSON ----
        if (!ws.role) {
            // The very first message MUST be a JSON registration. A binary
            // first frame is a protocol error — reject it without trying to
            // decode (avoids spending CPU on a possibly-huge buffer).
            if (isBinary) {
                try { ws.close(4001, 'binary before registration'); } catch { /* noop */ }
                return;
            }
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                try { ws.close(4001, 'invalid registration'); } catch { /* noop */ }
                return;
            }

            if (msg.type === 'robot') {
                if (ROBOT_TOKEN && msg.token !== ROBOT_TOKEN) {
                    log(`ROBOT rejected (${ip}): bad token`);
                    try { ws.close(4003, 'unauthorized'); } catch { /* noop */ }
                    return;
                }
                if (robot && robot !== ws) {
                    log('replacing previous robot connection');
                    try { robot.close(4002, 'replaced'); } catch { /* noop */ }
                }
                ws.role = 'robot';
                robot   = ws;
                clearTimeout(registerTimer);
                log(`ROBOT registered (${ip})`);
                safeSend(ws, JSON.stringify({ type: 'welcome', role: 'robot' }));
                notifyRobotStatus();
            } else if (msg.type === 'controller') {
                if (CONTROLLER_TOKEN && msg.token !== CONTROLLER_TOKEN) {
                    log(`CONTROLLER rejected (${ip}): bad token`);
                    try { ws.close(4003, 'unauthorized'); } catch { /* noop */ }
                    return;
                }
                ws.role = 'controller';
                ws.cmdWindowStart = Date.now();
                ws.cmdCount       = 0;
                ws.lastCmd        = null;   // for server-side dedupe
                ws.lastCmdAt      = 0;
                ws.dedupedCount   = 0;
                controllers.add(ws);
                clearTimeout(registerTimer);
                log(`CONTROLLER registered (${ip}) - total=${controllers.size}`);
                safeSend(ws, JSON.stringify({
                    type: 'welcome',
                    role: 'controller',
                    robotConnected:  robot  !== null,
                    cameraConnected: camera !== null,
                }));
            } else if (msg.type === 'camera') {
                if (CAMERA_TOKEN && msg.token !== CAMERA_TOKEN) {
                    log(`CAMERA rejected (${ip}): bad token`);
                    try { ws.close(4003, 'unauthorized'); } catch { /* noop */ }
                    return;
                }
                if (camera && camera !== ws) {
                    log('replacing previous camera connection');
                    try { camera.close(4002, 'replaced'); } catch { /* noop */ }
                }
                ws.role = 'camera';
                camera  = ws;
                clearTimeout(registerTimer);
                log(`CAMERA registered (${ip})`);
                safeSend(ws, JSON.stringify({ type: 'welcome', role: 'camera' }));
                notifyRobotStatus();   // broadcast camera-online to controllers
            } else {
                try { ws.close(4001, 'unknown type'); } catch { /* noop */ }
            }
            return;
        }

        // ---- Camera: binary frames are forwarded to all controllers ----
        if (ws.role === 'camera') {
            if (!isBinary) {
                // Allow JSON control frames from the camera (e.g. heartbeat
                // or metadata), but never treat them as video data.
                const text = raw.toString();
                log(`CAMERA->relay (json, ${text.length}B): ${text.slice(0, 120)}`);
                return;
            }
            const len = raw.length;
            if (len > MAX_VIDEO_FRAME_BYTES) {
                // Frame too big — drop. ESP32-CAM at QVGA/QQVGA + JPEG
                // quality 12 produces frames well under 96 KB.
                videoStats.framesDropped += 1;
                if (videoStats.framesDropped % 30 === 1) {
                    log(`camera frame ${len}B exceeds cap ${MAX_VIDEO_FRAME_BYTES}B - dropped`);
                }
                return;
            }
            videoStats.framesIn   += 1;
            videoStats.bytesIn    += len;
            videoStats.lastFrameAt = Date.now();
            fanoutFrameToControllers(raw);
            return;
        }

        // ---- Subsequent messages (controller/robot text protocol) ----
        if (isBinary) {
            // Only cameras may send binary. Silently drop binary frames
            // from other roles — closing would be too punitive given the
            // controller/robot text protocol is the source of truth.
            return;
        }
        // Per-role text-frame cap. The transport-level `maxPayload` is sized
        // for video frames (~96 KB) and therefore cannot enforce the 4 KB
        // cmd/telemetry budget on its own. Enforce it here.
        if (raw.length > MAX_CMD_PAYLOAD) {
            log(`${ws.role} sent ${raw.length}B text frame (cap ${MAX_CMD_PAYLOAD}B) - closing`);
            try { ws.close(1009, 'message too big'); } catch { /* noop */ }
            return;
        }
        const text = raw.toString().trim();

        if (ws.role === 'controller') {
            // Per-controller rate limit (sliding 1-second window).
            const now = Date.now();
            if (now - ws.cmdWindowStart >= 1000) {
                ws.cmdWindowStart = now;
                ws.cmdCount       = 0;
            }
            ws.cmdCount += 1;
            if (ws.cmdCount > CMD_RATE_LIMIT) {
                // Only emit one warning per overflow window to avoid log spam.
                if (ws.cmdCount === CMD_RATE_LIMIT + 1) {
                    log(`controller ${ip} rate-limited (>${CMD_RATE_LIMIT}/s)`);
                    safeSend(ws, JSON.stringify({
                        type: 'error', message: 'rate limit exceeded',
                    }));
                }
                return;
            }

            // Accept either a raw single-char command or JSON {cmd:"F"}.
            let cmd = text;
            if (text.startsWith('{')) {
                try { cmd = (JSON.parse(text).cmd || '').toUpperCase(); }
                catch { cmd = ''; }
            }
            cmd = (cmd || '').toUpperCase();

            if (!VALID_COMMANDS.has(cmd)) {
                log(`invalid command from controller: "${text}"`);
                return;
            }

            // Server-side dedupe: drop identical consecutive commands within
            // CMD_DEDUPE_MS. STOP ('S') is always forwarded so a release frame
            // never gets swallowed. This protects egress bandwidth and the
            // ESP32 from clients that haven't been updated to throttle.
            if (CMD_DEDUPE_MS > 0 && cmd !== 'S' &&
                cmd === ws.lastCmd && (now - ws.lastCmdAt) < CMD_DEDUPE_MS) {
                ws.dedupedCount += 1;
                // Log a single notice per 100 dropped to surface stale clients
                // without flooding the log.
                if (ws.dedupedCount % 100 === 1) {
                    log(`controller ${ip} sent ${ws.dedupedCount} duplicate '${cmd}' frames (dedupe ${CMD_DEDUPE_MS}ms)`);
                }
                return;
            }
            ws.lastCmd   = cmd;
            ws.lastCmdAt = now;

            log(`CMD ${cmd}  ->  robot ${robot ? 'OK' : 'OFFLINE'}`);

            if (robot && robot.readyState === WebSocket.OPEN) {
                robot.send(cmd);          // single byte for minimum latency
            } else {
                safeSend(ws, JSON.stringify({
                    type: 'error', message: 'robot offline',
                }));
            }
        } else if (ws.role === 'robot') {
            // Optional telemetry from the robot is relayed to controllers.
            log(`ROBOT->ctrl: ${text}`);
            broadcastToControllers(JSON.stringify({
                type: 'telemetry', data: text,
            }));
        }
    });

    // -------- heartbeat --------
    ws.on('pong', () => { ws.isAlive = true; });

    // -------- disconnect --------
    ws.on('close', (code, reason) => {
        clearTimeout(registerTimer);
        if (ws.role === 'robot' && robot === ws) {
            robot = null;
            log(`ROBOT disconnected (${code} ${reason})`);
            notifyRobotStatus();
        } else if (ws.role === 'camera' && camera === ws) {
            camera = null;
            log(`CAMERA disconnected (${code} ${reason})`);
            notifyRobotStatus();
        } else if (ws.role === 'controller') {
            controllers.delete(ws);
            log(`CONTROLLER disconnected (${code}). remaining=${controllers.size}`);
        } else {
            log(`unregistered client disconnected (${code})`);
        }
    });

    ws.on('error', (err) => log('socket error:', err.message));
});

// ---------------------------------------------------------------------------
// Keep-alive ping loop - prunes dead connections
// ---------------------------------------------------------------------------
const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try { ws.ping(); } catch { /* noop */ }
    });
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown() {
    log('shutting down...');
    clearInterval(heartbeat);
    wss.clients.forEach((c) => {
        try { c.close(1001, 'server shutdown'); } catch { /* noop */ }
    });
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(PORT, () => {
    log(`Robot WS relay listening on port ${PORT}`);
    log(`HTTP: http://0.0.0.0:${PORT}/  Health: /health  WS: /ws`);
    logStartupConfig();
});
