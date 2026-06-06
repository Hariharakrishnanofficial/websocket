/**
 * Robot Controller — Slate (Vite + React)
 * ----------------------------------------------------------------------------
 *  - Auto-connects to the Catalyst AppSail WebSocket relay.
 *  - Registers as {"type":"controller"}.
 *  - Sends single-character commands (F/B/L/R/S) for minimum latency.
 *  - Mobile-friendly touch UI + keyboard support (arrows / WASD / space).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRobotSocket } from './useRobotSocket.js';
import './App.css';

const COMMANDS = {
    F: { label: '▲',    name: 'Forward'  },
    B: { label: '▼',    name: 'Backward' },
    L: { label: '◀',    name: 'Left'     },
    R: { label: '▶',    name: 'Right'    },
    S: { label: 'STOP', name: 'Stop'     },
};

function App() {
    const {
        status, robotOnline, serverURL, setServerURL,
        logLines, sendCmd, reconnect,
    } = useRobotSocket();

    const [activeBtn, setActiveBtn] = useState(null);

    const press = useCallback((cmd) => {
        if (!sendCmd(cmd)) return;
        setActiveBtn(cmd);
        setTimeout(() => setActiveBtn((b) => (b === cmd ? null : b)), 120);
    }, [sendCmd]);

    // Keyboard control
    useEffect(() => {
        const map = {
            ArrowUp:    'F', w: 'F', W: 'F',
            ArrowDown:  'B', s: 'B', S: 'B',
            ArrowLeft:  'L', a: 'L', A: 'L',
            ArrowRight: 'R', d: 'R', D: 'R',
            ' ':        'S',
        };
        const onKey = (e) => {
            const c = map[e.key];
            if (c) { e.preventDefault(); press(c); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [press]);

    const disabled = status !== 'connected';
    const statusText = {
        connecting:   'Connecting…',
        connected:    robotOnline ? 'Connected · Robot online' : 'Connected · Robot OFFLINE',
        disconnected: 'Disconnected',
    }[status];

    const dotClass = `dot ${status === 'connected' && !robotOnline ? 'amber' : status}`;

    return (
        <div className="card">
            <h1>🤖 Robot Controller</h1>
            <div className="sub">Catalyst AppSail relay · single-character protocol</div>

            <div className="status">
                <span className={dotClass} />
                <span>{statusText}</span>
            </div>

            <div className="pad">
                {['F', 'L', 'S', 'R', 'B'].map((c) => (
                    <button
                        key={c}
                        type="button"
                        disabled={disabled}
                        className={`btn ${
                            c === 'F' ? 'fwd' :
                            c === 'B' ? 'back' :
                            c === 'L' ? 'left' :
                            c === 'R' ? 'right' : 'stop'
                        } ${activeBtn === c ? 'active' : ''}`}
                        onPointerDown={() => press(c)}
                        aria-label={COMMANDS[c].name}
                    >
                        {COMMANDS[c].label}
                    </button>
                ))}
            </div>

            <div style={{ marginTop: 16 }}>
                <div className="row">
                    <span className="small">Server URL</span>
                    <span className="small">arrows / WASD / space</span>
                </div>
                <input
                    className="url"
                    value={serverURL}
                    onChange={(e) => setServerURL(e.target.value)}
                    onBlur={reconnect}
                    spellCheck={false}
                />
            </div>

            <div className="log">
                {logLines.length === 0
                    ? 'log…'
                    : logLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
}

export default App;
