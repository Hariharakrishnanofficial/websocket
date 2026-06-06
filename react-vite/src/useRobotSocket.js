/**
 * useRobotSocket
 * ----------------------------------------------------------------------------
 *  React hook that owns the WebSocket connection to the Catalyst AppSail
 *  robot relay. Auto-reconnects with exponential backoff, registers the
 *  client as a "controller", surfaces connection + robot-online state,
 *  and exposes a sendCmd(char) function.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function defaultServerURL() {
    // 1. Build-time override (recommended for production):
    //    set VITE_WS_URL=wss://appsail-XXXX.development.catalystserverless.com/ws
    const envUrl = import.meta.env?.VITE_WS_URL;
    if (envUrl) return envUrl;

    // 2. Runtime override via ?server=... query string.
    const params = new URLSearchParams(window.location.search);
    if (params.get('server')) return params.get('server');

    // 3. Local dev fallback -> ws://<host>:8080.
    const host  = window.location.hostname || 'localhost';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // If we are already served over https (Slate prod), default to wss on the same host /ws path.
    if (proto === 'wss') return `${proto}://${host}/ws`;
    return `${proto}://${host}:8080`;
}

export function useRobotSocket(initialUrl) {
    const [serverURL, setServerURL]  = useState(initialUrl ?? defaultServerURL());
    const [status, setStatus]        = useState('connecting'); // connecting|connected|disconnected
    const [robotOnline, setRobot]    = useState(false);
    const [logLines, setLogLines]    = useState([]);

    const wsRef      = useRef(null);
    const retryRef   = useRef(0);
    const reconTimer = useRef(null);

    const addLog = useCallback((line) => {
        const t = new Date().toLocaleTimeString();
        setLogLines((l) => [`${t}  ${line}`, ...l].slice(0, 30));
    }, []);

    const connect = useCallback(() => {
        clearTimeout(reconTimer.current);
        setStatus('connecting');
        addLog(`connecting -> ${serverURL}`);

        let ws;
        try { ws = new WebSocket(serverURL); }
        catch (e) {
            addLog(`bad URL: ${e.message}`);
            setStatus('disconnected');
            return;
        }
        wsRef.current = ws;

        ws.onopen = () => {
            retryRef.current = 0;
            setStatus('connected');
            ws.send(JSON.stringify({ type: 'controller' }));
            addLog('registered as controller');
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'welcome') {
                    setRobot(!!msg.robotConnected);
                    addLog(`server welcome (robot=${msg.robotConnected ? 'on' : 'off'})`);
                } else if (msg.type === 'status') {
                    setRobot(!!msg.robotConnected);
                    addLog(`robot ${msg.robotConnected ? 'connected' : 'disconnected'}`);
                } else if (msg.type === 'error') {
                    addLog(`server error: ${msg.message}`);
                } else if (msg.type === 'telemetry') {
                    addLog(`telemetry: ${msg.data}`);
                }
            } catch {
                /* ignore non-JSON */
            }
        };

        ws.onerror = () => addLog('socket error');

        ws.onclose = () => {
            setStatus('disconnected');
            setRobot(false);
            const backoff = Math.min(1000 * 2 ** retryRef.current, 8000);
            retryRef.current += 1;
            addLog(`disconnected, retry in ${backoff} ms`);
            reconTimer.current = setTimeout(connect, backoff);
        };
    }, [serverURL, addLog]);

    useEffect(() => {
        connect();
        return () => {
            clearTimeout(reconTimer.current);
            const ws = wsRef.current;
            if (ws) {
                ws.onclose = null;
                try { ws.close(); } catch { /* noop */ }
            }
        };
    }, [connect]);

    const sendCmd = useCallback((cmd) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(cmd);                       // raw 1-byte payload
        addLog(`-> ${cmd}`);
        return true;
    }, [addLog]);

    const reconnect = useCallback(() => {
        retryRef.current = 0;
        const ws = wsRef.current;
        if (ws) {
            ws.onclose = null;
            try { ws.close(); } catch { /* noop */ }
        }
        connect();
    }, [connect]);

    return {
        status, robotOnline, serverURL, setServerURL,
        logLines, sendCmd, reconnect,
    };
}
