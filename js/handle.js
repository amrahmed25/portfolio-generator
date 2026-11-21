/**
 * handle.js
 * User-handle rules shared by the signup page.
 *
 * IMPORTANT: this is a convenience layer only. PostgreSQL is authoritative:
 *   - profiles.user_handle is NOT NULL, lowercase, 3-30 chars, ^[a-z0-9]+(-[a-z0-9]+)*$
 *   - a unique index exists on lower(user_handle)
 *   - supabase_security_remediation.sql adds the reserved-name check (keep RESERVED_HANDLES
 *     below in sync with the list in public.enforce_profile_policy() in that file).
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
export const HANDLE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Names that would collide with site routes/files or look official. Keep in sync with the SQL. */
export const RESERVED_HANDLES = Object.freeze([
  'admin', 'administrator', 'api', 'app', 'assets', 'auth', 'community', 'css', 'dashboard',
  'explore', 'help', 'index', 'js', 'login', 'logout', 'moderator', 'null', 'portfolio',
  'portfolio-builder', 'portfoliohub', 'profile', 'public-portfolio', 'register', 'reset-password',
  'root', 'settings', 'signin', 'signup', 'staff', 'support', 'system', 'templates', 'u',
  'undefined', 'user', 'users', 'www'
]);

/**
 * Validates a handle exactly as typed (no silent rewriting).
 * @returns {{ valid: boolean, message: string }}
 */
export function validateHandle(value) {
  const v = String(value ?? '');
  if (!v) return { valid: false, message: 'Choose a user handle.' };
  if (/\s/.test(v)) return { valid: false, message: 'A handle cannot contain spaces. Use hyphens instead.' };
  if (v.length < HANDLE_MIN) return { valid: false, message: `Your handle must be at least ${HANDLE_MIN} characters.` };
  if (v.length > HANDLE_MAX) return { valid: false, message: `Your handle can be at most ${HANDLE_MAX} characters.` };
  if (v !== v.toLowerCase()) return { valid: false, message: 'Use lowercase letters only.' };
  if (!HANDLE_PATTERN.test(v)) {
    return {
      valid: false,
      message: 'Use only lowercase letters, numbers and single hyphens between them (no leading, trailing or double hyphens).'
    };
  }
  if (RESERVED_HANDLES.includes(v)) return { valid: false, message: 'That handle is reserved. Please choose another.' };
  return { valid: true, message: '' };
}

/**
 * Asks the database whether a (valid, lowercase) handle is already used.
 * profiles is publicly readable, so this works before sign-in.
 * Because the DB enforces lowercase handles, an equality match is also the
 * case-insensitive match.
 *
 * @returns {Promise<'available'|'taken'|'unknown'>} 'unknown' = the check itself failed;
 *          callers must not block signup on it, the database decides.
 */
export async function checkHandleAvailability(supabase, handle) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_handle', handle.toLowerCase())
      .limit(1);
    if (error) return 'unknown';
    return data && data.length ? 'taken' : 'available';
  } catch (_) {
    return 'unknown';
  }
}
