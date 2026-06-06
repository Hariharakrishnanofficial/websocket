/**
 * Environment profiles recognised by the AppSail backend.
 *
 * The active profile is resolved from (in order):
 *   1. process.env.ENVIRONMENT          (canonical, matches `cfg_*` row column)
 *   2. process.env.NODE_ENV             (Node ecosystem fallback)
 *   3. 'development'                    (safest local default)
 *
 * Profiles drive:
 *   - which `cfg_*` rows are loaded via gsi_env_active
 *   - safe-default fallbacks (see safeDefaults.js)
 *   - log verbosity and warning thresholds
 */

export const PROFILE = Object.freeze({
  DEVELOPMENT: 'development',
  STAGING:     'staging',
  PRODUCTION:  'production',
});

export const ALL_PROFILES = Object.values(PROFILE);

export function resolveProfile() {
  const raw = (process.env.ENVIRONMENT || process.env.NODE_ENV || 'development').toLowerCase();
  if (ALL_PROFILES.includes(raw)) return raw;
  if (raw === 'prod') return PROFILE.PRODUCTION;
  if (raw === 'dev')  return PROFILE.DEVELOPMENT;
  return PROFILE.DEVELOPMENT;
}

export function isProduction(profile) { return profile === PROFILE.PRODUCTION; }
