/**
 * ============================================================================
 *  Robot Control WebSocket Server
 * ============================================================================
 *  Acts as a low-latency message broker between a browser-based Controller
 *  (React/HTML) and an ESP32 Robot client.
 *
 *  Protocol:
 *    - Every client MUST send its first message as a JSON registration:
 *          {"type":"controller"}   OR   {"type":"robot"}
 *    - After registration, the Controller sends single-character commands
 *      (F | B | L | R | S) which are forwarded verbatim to the Robot.
 *
 *  Run:
 *      npm install
 *      node server.js
 * ============================================================================
 */

'use strict';

const WebSocket = require('ws');
const http      = require('http');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT             = process.env.PORT || 8080;
const VALID_COMMANDS   = new Set(['F', 'B', 'L', 'R', 'S']);
const HEARTBEAT_MS     = 30_000;        // keep-alive ping every 30s
const REGISTER_TIMEOUT = 5_000;         // drop clients that don't register in 5s

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const controllers = new Set();   // multiple controllers allowed
let   robot       = null;        // single active robot connection

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ts() {
    return new Date().toISOString();
}

function log(...args) {
    console.log(`[${ts()}]`, ...args);
}

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
    const status = JSON.stringify({
        type: 'status',
        robotConnected: robot !== null,
    });
    broadcastToControllers(status);
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const httpServer = http.createServer((req, res) => {
    // tiny health-check endpoint
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            robot: robot !== null,
            controllers: controllers.size,
        }));
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    ws.role  = null;
    ws.isAlive = true;

    log(`new connection from ${ip} (awaiting registration)`);

    // Disconnect clients that never identify themselves
    const registerTimer = setTimeout(() => {
        if (!ws.role) {
            log(`registration timeout for ${ip} - closing`);
            ws.close(4000, 'registration timeout');
        }
    }, REGISTER_TIMEOUT);

    // -------- message handling --------
    ws.on('message', (raw) => {
        // First message: registration JSON
        if (!ws.role) {
            let msg;
            try { msg = JSON.parse(raw.toString()); }
            catch { ws.close(4001, 'invalid registration'); return; }

            if (msg.type === 'robot') {
                // Replace any stale robot connection
                if (robot && robot !== ws) {
                    log('replacing previous robot connection');
                    try { robot.close(4002, 'replaced'); } catch {}
                }
                ws.role = 'robot';
                robot   = ws;
                clearTimeout(registerTimer);
                log(`ROBOT registered (${ip})`);
                safeSend(ws, JSON.stringify({ type: 'welcome', role: 'robot' }));
                notifyRobotStatus();
            } else if (msg.type === 'controller') {
                ws.role = 'controller';
                controllers.add(ws);
                clearTimeout(registerTimer);
                log(`CONTROLLER registered (${ip}) - total=${controllers.size}`);
                safeSend(ws, JSON.stringify({
                    type: 'welcome',
                    role: 'controller',
                    robotConnected: robot !== null,
                }));
            } else {
                ws.close(4001, 'unknown type');
            }
            return;
        }

        // Subsequent messages
        const text = raw.toString().trim();

        if (ws.role === 'controller') {
            // Accept either a raw single-char command or JSON {cmd:"F"}
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

            log(`CMD ${cmd}  ->  robot ${robot ? 'OK' : 'OFFLINE'}`);

            if (robot && robot.readyState === WebSocket.OPEN) {
                // Forward as a single byte for minimum latency
                robot.send(cmd);
            } else {
                safeSend(ws, JSON.stringify({
                    type: 'error', message: 'robot offline',
                }));
            }
        } else if (ws.role === 'robot') {
            // Optional telemetry from the robot is relayed to controllers
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
            // Tell controllers + ask any future robot to stop (safety)
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
        try { ws.ping(); } catch {}
    });
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown() {
    log('shutting down...');
    clearInterval(heartbeat);
    wss.clients.forEach((c) => { try { c.close(1001, 'server shutdown'); } catch {} });
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(PORT, () => {
    log(`Robot WebSocket server listening on ws://0.0.0.0:${PORT}`);
    log(`Health check: http://0.0.0.0:${PORT}/health`);
});
