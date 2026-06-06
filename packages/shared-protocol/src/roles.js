/**
 * WebSocket connection roles recognised by the relay.
 * Keep in sync with appsail-nodejs/src/modules/* handlers.
 */
export const ROLE = Object.freeze({
  CONTROLLER: 'controller',
  ROBOT:      'robot',
  CAMERA:     'camera',
});

export const ALL_ROLES = Object.values(ROLE);

export function isRole(value) {
  return ALL_ROLES.includes(value);
}
