/**
 * useHoldButton — pointer-event handlers for a press-and-hold control.
 *
 * Uses Pointer Capture so the press is not lost when the finger/cursor
 * slides off the button. Idempotent release matches RobotClient.stopHold().
 */
import { useCallback, useRef } from 'react';
import robotClient from '@services/RobotClient.js';
import { useSettingsStore } from '@stores/settingsStore.js';
import { vibrate, click } from '@services/feedback.js';
import { isHold, isStop } from '@services/protocol.js';

export function useHoldButton(cmd) {
  const heldRef = useRef(false);

  const onPointerDown = useCallback((e) => {
    if (!cmd) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    const { ui } = useSettingsStore.getState();
    if (ui.vibration) vibrate(10);
    if (ui.sound) click({ freq: 720 });
    if (isHold(cmd)) {
      heldRef.current = true;
      robotClient.startHold(cmd);
    } else if (isStop(cmd)) {
      robotClient.sendCmd('S', { force: true });
    }
  }, [cmd]);

  const release = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    const { ui } = useSettingsStore.getState();
    if (ui.vibration) vibrate(5);
    if (ui.sound) click({ freq: 540, gain: 0.025 });
    if (isHold(cmd)) robotClient.stopHold();
  }, [cmd]);

  const onPointerUp     = useCallback((e) => { e.preventDefault(); release(); }, [release]);
  const onPointerCancel = useCallback(() => release(), [release]);
  const onContextMenu   = useCallback((e) => e.preventDefault(), []);

  return { onPointerDown, onPointerUp, onPointerCancel, onContextMenu };
}

export default useHoldButton;
