/**
 * useLatencyProbe — approximate round-trip latency without changing protocol.
 *
 * Strategy:
 *  - When the page becomes visible, RobotClient receives unsolicited
 *    `{type:"status"}` and `{type:"welcome"}` frames from the relay on
 *    connection events. We time the gap between our TX and the next RX as
 *    a coarse upper bound.
 *  - For finer measurement we time the round-trip of telemetry frames the
 *    robot emits in response to commands. If neither happens, the value
 *    remains null and the UI shows "—".
 *
 * This is intentionally best-effort; no new protocol fields are added.
 */
import { useEffect, useState } from 'react';
import robotClient from '@services/RobotClient.js';

export function useLatencyProbe() {
  const [latencyMs, setLatencyMs] = useState(null);

  useEffect(() => {
    let lastTxAt = 0;

    const offTx = robotClient.on('tx', ({ ts }) => {
      lastTxAt = ts;
    });
    const offRx = robotClient.on('rx', ({ ts }) => {
      if (lastTxAt === 0) return;
      const dt = ts - lastTxAt;
      if (dt > 0 && dt < 5000) {
        // Exponential moving average to smooth jitter
        setLatencyMs((prev) =>
          prev == null ? dt : Math.round(prev * 0.7 + dt * 0.3)
        );
      }
      // reset so we don't pair this RX with future TXs
      lastTxAt = 0;
    });

    return () => { offTx(); offRx(); };
  }, []);

  return latencyMs;
}

export default useLatencyProbe;
