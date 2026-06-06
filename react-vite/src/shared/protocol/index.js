/**
 * Vendored copy of `@ws/shared-protocol`.
 *
 * The monorepo workspace dep was inlined here so the `react-vite/` Slate
 * target is self-contained and can `npm install` cleanly during deploy
 * (workspace packages outside `react-vite/` are not visible to the Slate
 * deployer's npm step).
 *
 * Source of truth: `/packages/shared-protocol/`. Keep in lockstep.
 */
export { ROLE, ALL_ROLES, isRole }                       from './roles.js';
export { MSG, MSG_TYPE_KEY, ALL_MSG_TYPES, isEnvelope }  from './messages.js';
export { LIMITS }                                        from './limits.js';
