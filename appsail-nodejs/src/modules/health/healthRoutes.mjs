/**
 * Health & liveness endpoints.
 *
 *   GET /          → service banner (JSON, used by load balancers & humans)
 *   GET /health    → detailed liveness + leak-safe config summary
 *
 * Both routes are synchronous and never touch NoSQL — they must remain
 * answerable even when the datastore is unreachable.
 */

export function createHealthRouter({ sessionRegistry, config, videoStats }) {
  return function mount(app) {
    app.get('/', (_req, res) => {
      res.json({
        service:         'robot-ws-relay',
        ok:              true,
        robotConnected:  !!sessionRegistry.robot,
        cameraConnected: !!sessionRegistry.camera,
        controllers:     sessionRegistry.controllerCount,
        ws:              config.current().websocket.endpointPath,
      });
    });

    app.get('/health', (_req, res) => {
      res.json({
        ok:           true,
        robot:        !!sessionRegistry.robot,
        camera:       !!sessionRegistry.camera,
        controllers:  sessionRegistry.controllerCount,
        uptimeSec:    Math.round(process.uptime()),
        video: {
          fpsIn:           videoStats.fpsIn,
          fpsOut:          videoStats.fpsOut,
          kbpsIn:          videoStats.kbpsIn,
          lastFrameAgoMs:  videoStats.lastFrameAt ? Date.now() - videoStats.lastFrameAt : null,
          framesDropped1s: videoStats.framesDropped,
        },
        config: config.summary(),
      });
    });
  };
}
