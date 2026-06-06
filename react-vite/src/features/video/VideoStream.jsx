import { useEffect, useRef, useState } from 'react';
import robotClient from '@services/RobotClient.js';
import { useVideoStore } from './store.js';

/**
 * <VideoStream/> — live MJPEG-over-WebSocket viewer.
 *
 * How it works
 * ------------
 *  1. Subscribes to RobotClient's `frame` event (a Blob per JPEG frame).
 *  2. Decodes the blob off the main thread via `createImageBitmap`, which is
 *     hardware-accelerated and ~5× faster than Image+URL.createObjectURL.
 *  3. Draws the bitmap into a <canvas>. The canvas is sized once to the
 *     first frame's dimensions, then reused — no allocation in the hot loop.
 *  4. Keeps rolling FPS / kbps / decodeMs in a ref-counted accumulator and
 *     pushes a summary into the videoStore every 500 ms (off the render path).
 *
 * Why a canvas instead of <img src="blob:...">
 * --------------------------------------------
 *  - Object-URL blobs leak unless explicitly revoked; with 12 fps that's a
 *    GC storm. ImageBitmap is owned by the canvas and freed deterministically.
 *  - <img> repaints are tied to the browser's image decoder thread which on
 *    many devices stalls under load. Canvas lets us drop frames cleanly when
 *    a previous decode is still in flight.
 */
export default function VideoStream({ className = '', overlay = true }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef({
    decoding:    false,    // back-pressure guard — drop frames if busy
    framesShown: 0,
    bytesShown:  0,
    decodeAccMs: 0,
    decodeSamples: 0,
    sized:       false,
  });
  const cameraOnline = useVideoStore((s) => s.cameraOnline);
  const fps          = useVideoStore((s) => s.fps);
  const bps          = useVideoStore((s) => s.bytesPerSec);
  const decodeMs     = useVideoStore((s) => s.decodeMs);
  const [lastFrameAgo, setLastFrameAgo] = useState(null);

  // ---- frame pump --------------------------------------------------------
  useEffect(() => {
    const off = robotClient.on('frame', async ({ blob, bytes }) => {
      const st = stateRef.current;
      // Drop this frame if we're still decoding the last one. Better to
      // skip than to queue — queuing only adds latency.
      if (st.decoding) return;
      st.decoding = true;
      const t0 = performance.now();
      let bitmap;
      try {
        bitmap = await createImageBitmap(blob);
      } catch {
        useVideoStore.getState().bumpError();
        st.decoding = false;
        return;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        if (!st.sized
            || canvas.width  !== bitmap.width
            || canvas.height !== bitmap.height) {
          canvas.width  = bitmap.width;
          canvas.height = bitmap.height;
          st.sized = true;
        }
        const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        if (ctx) ctx.drawImage(bitmap, 0, 0);
      }
      bitmap.close?.();
      const dt = performance.now() - t0;
      st.decodeAccMs   += dt;
      st.decodeSamples += 1;
      st.framesShown   += 1;
      st.bytesShown    += bytes;
      st.decoding = false;
    });
    return off;
  }, []);

  // ---- 2 Hz stats roll-up ------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      const st = stateRef.current;
      // Scale to per-second
      const fpsNow   = st.framesShown * 2;
      const bpsNow   = st.bytesShown  * 2;
      const decMean  = st.decodeSamples ? st.decodeAccMs / st.decodeSamples : 0;
      useVideoStore.getState().setStats({
        fps:         fpsNow,
        bytesPerSec: bpsNow,
        decodeMs:    Math.round(decMean * 10) / 10,
        lastFrameAt: st.framesShown ? Date.now() : useVideoStore.getState().lastFrameAt,
      });
      // reset window
      st.framesShown = 0;
      st.bytesShown  = 0;
      st.decodeAccMs = 0;
      st.decodeSamples = 0;
      // Drive the "stale frame" indicator.
      const lf = useVideoStore.getState().lastFrameAt;
      setLastFrameAgo(lf ? Date.now() - lf : null);
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ---- camera-online from RobotClient ------------------------------------
  useEffect(() => {
    // Initial state sync (in case the welcome envelope arrived before we mounted).
    useVideoStore.getState().setCameraOnline(robotClient.cameraOnline);
    const off = robotClient.on('cameraOnline', (v) => {
      useVideoStore.getState().setCameraOnline(v);
    });
    return off;
  }, []);

  const stale = lastFrameAgo != null && lastFrameAgo > 2000;
  const kbps  = Math.round((bps * 8) / 1024);

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-black aspect-[4/3] ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {(!cameraOnline || stale) && (
        <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-muted bg-black/60 backdrop-blur-sm">
          {!cameraOnline ? (
            <div>
              <div className="text-sm font-medium text-white/80">Camera offline</div>
              <div className="mt-1 opacity-70">Waiting for ESP32-CAM to connect…</div>
            </div>
          ) : (
            <div className="text-warn">No frames for {Math.round(lastFrameAgo / 1000)}s</div>
          )}
        </div>
      )}

      {overlay && cameraOnline && (
        <div className="absolute top-1.5 left-1.5 flex gap-1 text-[10px] font-mono text-white/85">
          <span className="rounded bg-black/55 px-1.5 py-0.5">{fps} fps</span>
          <span className="rounded bg-black/55 px-1.5 py-0.5">{kbps} kbps</span>
          <span className="rounded bg-black/55 px-1.5 py-0.5">{decodeMs}ms dec</span>
        </div>
      )}
    </div>
  );
}
