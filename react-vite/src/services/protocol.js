/**
 * Protocol contract — frozen constants from CORE_LOGIC.md.
 *
 * DO NOT expose these as user-editable settings. Breaking the invariant
 *     DEDUPE_MS < HEARTBEAT_MS < COMMAND_TIMEOUT_MS
 * either drops heartbeats (robot stops mid-hold) or makes the firmware
 * watchdog useless. They are part of the cross-layer contract with the
 * AppSail relay and ESP32 firmware.
 */

export const HEARTBEAT_MS = 300;          // controller heartbeat
export const DEDUPE_MS = 250;             // client-side dedupe window
export const COMMAND_TIMEOUT_MS = 750;    // firmware watchdog (informational here)
export const RELAY_DEDUPE_MS = 200;       // relay-side safety net (informational)

export const CMD = Object.freeze({
  F: 'F', // Forward
  B: 'B', // Backward
  L: 'L', // Left
  R: 'R', // Right
  S: 'S', // Stop
});

export const VALID_COMMANDS = new Set(Object.values(CMD));
export const HOLD_COMMANDS = new Set([CMD.F, CMD.B, CMD.L, CMD.R]);

export const isStop = (c) => c === CMD.S;
export const isHold = (c) => HOLD_COMMANDS.has(c);
export const isValid = (c) => VALID_COMMANDS.has(c);

export const CMD_LABEL = {
  F: 'Forward',
  B: 'Backward',
  L: 'Left',
  R: 'Right',
  S: 'Stop',
};

export const CMD_GLYPH = {
  F: '▲',
  B: '▼',
  L: '◀',
  R: '▶',
  S: 'STOP',
};
