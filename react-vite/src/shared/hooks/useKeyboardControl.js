/**
 * useKeyboardControl — desktop / Bluetooth keyboard support for the controller.
 *
 *  Arrow keys + WASD = direction (hold). Space = STOP.
 *  Filters OS auto-repeat. Releases on window blur to avoid stuck motion.
 */
import { useEffect } from 'react';
import robotClient from '@services/RobotClient.js';
import { isHold } from '@services/protocol.js';

const MAP = {
  ArrowUp:    'F', w: 'F', W: 'F',
  ArrowDown:  'B', s: 'B', S: 'B',
  ArrowLeft:  'L', a: 'L', A: 'L',
  ArrowRight: 'R', d: 'R', D: 'R',
  ' ':        'S',
};

export function useKeyboardControl(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (e) => {
      if (e.repeat) return;
      const c = MAP[e.key];
      if (!c) return;
      e.preventDefault();
      if (isHold(c)) robotClient.startHold(c);
      else           robotClient.sendCmd(c, { force: true });
    };

    const onKeyUp = (e) => {
      const c = MAP[e.key];
      if (!c) return;
      if (isHold(c)) robotClient.stopHold();
    };

    const onBlur = () => robotClient.stopHold();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    window.addEventListener('blur',    onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      window.removeEventListener('blur',    onBlur);
    };
  }, [enabled]);
}

export default useKeyboardControl;
