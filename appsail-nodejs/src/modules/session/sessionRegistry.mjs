/**
 * In-memory session registry — the single source of truth for live WS clients
 * inside this AppSail process. Maps to §7 of BACKEND_ARCHITECTURE.md.
 *
 * Layout:
 *   - one active robot socket  (single-tenant for Phase 1)
 *   - one active camera socket (single-tenant for Phase 1)
 *   - N controller sockets
 *
 * Each entry carries:
 *   { id, ws, role, connectedAt, lastSeenAt, remoteIp }
 *
 * The registry is intentionally tiny. Heavier session metadata (binding,
 * audit, history) lives in NoSQL via the future SessionRepository — added
 * in Phase 2.
 */

let _seq = 0;
const nextId = (role) => `${role}-${Date.now().toString(36)}-${(++_seq).toString(36)}`;

export function createSessionRegistry() {
  /** @type {Map<string, object>} */
  const controllers = new Map();
  let robot  = null;
  let camera = null;

  function snapshot() {
    return {
      robot:  robot  ? publicView(robot)  : null,
      camera: camera ? publicView(camera) : null,
      controllers: [...controllers.values()].map(publicView),
      counts: {
        robot:       robot  ? 1 : 0,
        camera:      camera ? 1 : 0,
        controllers: controllers.size,
      },
    };
  }

  function publicView(e) {
    return {
      id:           e.id,
      role:         e.role,
      connectedAt:  e.connectedAt,
      lastSeenAt:   e.lastSeenAt,
      remoteIp:     e.remoteIp,
    };
  }

  function touch(entry) { entry.lastSeenAt = new Date().toISOString(); }

  // ---------------- controllers ----------------
  function addController(ws, { remoteIp }) {
    const entry = {
      id: nextId('ctrl'),
      ws,
      role: 'controller',
      connectedAt: new Date().toISOString(),
      lastSeenAt:  new Date().toISOString(),
      remoteIp,
    };
    controllers.set(entry.id, entry);
    return entry;
  }
  function removeController(id) { return controllers.delete(id); }
  function eachController(fn)   { for (const e of controllers.values()) fn(e); }
  function findControllerByWs(ws) {
    for (const e of controllers.values()) if (e.ws === ws) return e;
    return null;
  }

  // ---------------- robot ----------------
  function setRobot(ws, { remoteIp }) {
    const prev = robot;
    robot = {
      id: nextId('robot'),
      ws,
      role: 'robot',
      connectedAt: new Date().toISOString(),
      lastSeenAt:  new Date().toISOString(),
      remoteIp,
    };
    return { entry: robot, previous: prev };
  }
  function clearRobot(ws) {
    if (robot && (!ws || robot.ws === ws)) { const out = robot; robot = null; return out; }
    return null;
  }

  // ---------------- camera ----------------
  function setCamera(ws, { remoteIp }) {
    const prev = camera;
    camera = {
      id: nextId('cam'),
      ws,
      role: 'camera',
      connectedAt: new Date().toISOString(),
      lastSeenAt:  new Date().toISOString(),
      remoteIp,
    };
    return { entry: camera, previous: prev };
  }
  function clearCamera(ws) {
    if (camera && (!ws || camera.ws === ws)) { const out = camera; camera = null; return out; }
    return null;
  }

  return {
    // public read state
    get robot()         { return robot; },
    get camera()        { return camera; },
    get controllerCount() { return controllers.size; },
    controllerIterator: () => controllers.values(),
    eachController,
    findControllerByWs,
    snapshot,
    touch,

    // mutations
    addController,
    removeController,
    setRobot,
    clearRobot,
    setCamera,
    clearCamera,
  };
}
