/**
 * Reusable React hooks barrel.
 *
 * Hooks here MUST be feature-agnostic. Anything that knows about a specific
 * Zustand slice (e.g. `useRobotSocketBridge`) belongs in `src/app/` instead.
 */
export { useHoldButton }       from './useHoldButton.js';
export { useKeyboardControl }  from './useKeyboardControl.js';
export { useLatencyProbe }     from './useLatencyProbe.js';
export { usePWAInstall }       from './usePWAInstall.js';
export { useWakeLock }         from './useWakeLock.js';
