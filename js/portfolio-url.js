/**
 * portfolio-url.js
 * The ONLY place that knows how public portfolio URLs are built and parsed.
 *
 *   canonical:  /u/{user_handle}/{number}      e.g. /u/aammr/1
 *   legacy:     /u/{slug}                      still resolves, then is canonicalised
 *
 * Numbering: the database column portfolios.portfolio_number is allocated server-side
 * and starts at 0 for every user (existing data is 0-based and must not change).
 * Public URLs are 1-based, so  URL number = portfolio_number + 1.
 * Change PUBLIC_NUMBER_OFFSET here (and nowhere else) if that convention ever changes.
 *
 * No Supabase / DOM imports on purpose: this file is pure and unit-testable.
 */

export const PUBLIC_NUMBER_OFFSET = 1;

/** portfolio_number (DB, 0-based) -> number shown in the URL (1-based). */
export function toPublicNumber(portfolioNumber) {
  return Number(portfolioNumber) + PUBLIC_NUMBER_OFFSET;
}

/**
 * URL segment -> portfolio_number, or null when it is not a valid public number.
 * Accepts only plain positive integers: no sign, no decimals, no leading zeros, no "1e3".
 */
export function fromPublicNumber(segment) {
  const s = String(segment ?? '');
  if (!/^[1-9]\d{0,8}$/.test(s)) return null;
  return Number(s) - PUBLIC_NUMBER_OFFSET;
}

/** True when a portfolio-like object has what the canonical URL needs. */
export function hasCanonicalParts(p) {
  return !!p && typeof p.user_handle === 'string' && p.user_handle.trim() !== ''
    && Number.isInteger(Number(p.portfolio_number)) && p.portfolio_number !== null
    && Number(p.portfolio_number) >= 0;
}

/**
 * Builds the public URL.
 * @param {string|{user_handle?:string, portfolio_number?:number, slug?:string}} target
 *        An object with handle + number gives the canonical URL. A plain string (or an
 *        object lacking those parts) falls back to the legacy /u/<slug> URL, which the
 *        public page canonicalises after loading.
 * @param {{origin:string, hostname:string, pathname:string}} loc  usually window.location
 */
export function buildPublicUrl(target, loc) {
  const { origin, hostname, pathname } = loc;
  // Hosts without rewrite rules (local servers, GitHub Pages) need the query-string form.
  const noRewrite = /^(localhost|127\.|\[::1\])/.test(hostname) || hostname.endsWith('.github.io');
  const dir = pathname.replace(/[^/]*$/, '');
  const page = `${origin}${dir}public-portfolio.html`;

  if (hasCanonicalParts(target)) {
    const handle = target.user_handle.trim().toLowerCase();
    const n = toPublicNumber(target.portfolio_number);
    return noRewrite
      ? `${page}?u=${encodeURIComponent(handle)}&n=${n}`
      : `${origin}/u/${encodeURIComponent(handle)}/${n}`;
  }

  const slug = typeof target === 'string' ? target : (target && target.slug) || '';
  return noRewrite
    ? `${page}?u=${encodeURIComponent(slug)}`
    : `${origin}/u/${encodeURIComponent(slug)}`;
}

/**
 * Reads the portfolio reference out of the current location.
 *   /u/<handle>/<n>   or   ?u=<handle>&n=<n>   -> { handle, rawNumber }
 *   /u/<slug>         or   ?u=<slug>           -> { slug }
 *   anything else                              -> null
 * The number is returned raw; validate it with fromPublicNumber().
 */
export function parseRoute(pathname, search) {
  const params = new URLSearchParams(search || '');
  const safe = s => { try { return decodeURIComponent(s); } catch (_) { return s; } };

  const two = pathname.match(/\/u\/([^/]+)\/([^/]+)\/?$/);
  if (two) return { handle: safe(two[1]).trim().toLowerCase(), rawNumber: safe(two[2]).trim() };

  const one = pathname.match(/\/u\/([^/]+)\/?$/);
  const raw = (one ? safe(one[1]) : params.get('u') || '').trim().toLowerCase();
  if (!raw) return null;

  if (!one && params.has('n')) return { handle: raw, rawNumber: String(params.get('n')).trim() };
  return { slug: raw };
}
