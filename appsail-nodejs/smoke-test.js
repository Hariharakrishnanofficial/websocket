/**
 * End-to-end smoke test for the AppSail relay.
 * Starts index.js, registers a fake robot + fake controller, sends every
 * command, and asserts the robot received them in order.
 */
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import http from 'http';

const PORT = 9091;
process.env.X_ZOHO_CATALYST_LISTEN_PORT = String(PORT);

const server = spawn('node', ['index.js'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (b) => process.stdout.write(`[srv] ${b}`));
server.stderr.on('data', (b) => process.stderr.write(`[srv-err] ${b}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function getHealth() {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${PORT}/health`, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
}

function open(role) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: role }));
            resolve(ws);
        });
        ws.on('error', reject);
    });
}

(async () => {
    let exitCode = 0;
    try {
        await wait(500);
        const health = await getHealth();
        console.log('[test] /health ->', health);
        if (!health.ok) throw new Error('health check failed');

        const received = [];
        const robot = await open('robot');
        robot.on('message', (m) => {
            const s = m.toString();
            if (s.length === 1) received.push(s);
        });

        const controller = await open('controller');
        await wait(300);

        const sequence = ['F', 'B', 'L', 'R', 'S'];
        for (const c of sequence) {
            controller.send(c);
            await wait(60);
        }
        controller.send(JSON.stringify({ cmd: 'F' }));
        await wait(150);

        const expected = [...sequence, 'F'];
        const pass = received.length === expected.length &&
                     received.every((c, i) => c === expected[i]);

        console.log('[test] expected:', expected);
        console.log('[test] received:', received);
        console.log(pass ? '✅ PASS' : '❌ FAIL');

        controller.close();
        robot.close();
        if (!pass) exitCode = 1;
    } catch (err) {
        console.error('[test] error:', err);
        exitCode = 2;
    } finally {
        server.kill('SIGINT');
        setTimeout(() => process.exit(exitCode), 200);
    }
})();
