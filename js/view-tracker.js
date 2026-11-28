/**
 * view-tracker.js
 * Records ONE view per visitor per portfolio. The database is authoritative
 * (portfolio_views has PRIMARY KEY (portfolio_id, visitor_id) and record_portfolio_view() inserts atomically);
 * this module only supplies an identity and avoids pointless repeat requests.
 *
 * Identity
 *   - Signed-in visitor : the SERVER uses auth.uid(). Whatever id the browser sends is ignored.
 *   - Anonymous visitor : a random UUID v4 created in this browser (never derived from the person, the IP
 *     or the device), kept in localStorage and mirrored to a first-party cookie so that clearing one of the two
 *     does not create a "new" visitor. The server accepts it only if it is a well-formed UUID v4.
 *
 * Privacy: the id is random, first-party, contains no personal data and is sent only to our own database.
 * Limits (inherent, no fingerprinting is used): clearing all site data, a private window or another browser
 * or device is a new anonymous visitor; a visitor who has storage and cookies completely blocked cannot be
 * recognised, so such a visit is not counted rather than counted on every reload.
 */

const ID_KEY = 'ph_visitor_id';
const COOKIE_NAME = 'ph_vid';
const SEEN_KEY = 'ph_viewed';
const SEEN_MAX = 500;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;          // 400 days, the maximum browsers allow
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newUuidV4() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);   // last resort, still random
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function readCookie(doc) {
  try {
    const m = (doc.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE_NAME + '='));
    return m ? decodeURIComponent(m.slice(COOKIE_NAME.length + 1)) : null;
  } catch (_) { return null; }
}

function writeCookie(doc, value) {
  try {
    const secure = doc.location && doc.location.protocol === 'https:' ? '; Secure' : '';
    doc.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  } catch (_) { /* cookies blocked */ }
}

function getItem(storage, key) { try { return storage ? storage.getItem(key) : null; } catch (_) { return null; } }
function setItem(storage, key, value) { try { if (storage) storage.setItem(key, value); } catch (_) { /* blocked or full */ } }

/**
 * Returns this browser's anonymous visitor id (creating and persisting it on the first call),
 * or null when it cannot be persisted anywhere (then the caller must not count the visit).
 */
export function getVisitorId(storage = globalThis.localStorage, doc = globalThis.document) {
  let id = getItem(storage, ID_KEY);
  if (!(id && UUID_V4.test(id))) id = null;

  if (!id) {                                                    // recover from the cookie if storage was cleared
    const fromCookie = doc ? readCookie(doc) : null;
    if (fromCookie && UUID_V4.test(fromCookie)) id = fromCookie;
  }
  if (!id) id = newUuidV4();

  setItem(storage, ID_KEY, id);
  if (doc) writeCookie(doc, id);

  // Only trust the id if it really persisted somewhere; otherwise every reload would look like a new visitor.
  const persisted = getItem(storage, ID_KEY) === id || (doc && readCookie(doc) === id);
  return persisted ? id : null;
}

function readSeen(storage) {
  try { const a = JSON.parse(getItem(storage, SEEN_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}
function markSeen(storage, portfolioId) {
  const seen = readSeen(storage).filter(x => x !== portfolioId);
  seen.push(portfolioId);
  setItem(storage, SEEN_KEY, JSON.stringify(seen.slice(-SEEN_MAX)));
}

const inFlight = new Set();   // guards against duplicate calls inside one page (retries, double init, ...)

/**
 * Registers this visit. Safe to call any number of times: only the first successful call per
 * (visitor, portfolio) can ever change the counter, and later calls usually do not even hit the network.
 * Never throws; a failure here must not affect the page.
 * @returns {Promise<boolean>} true only when THIS call recorded a new unique view
 */
export async function recordPortfolioView(supabase, portfolioId, deps = {}) {
  const storage = 'storage' in deps ? deps.storage : globalThis.localStorage;
  const doc = 'doc' in deps ? deps.doc : globalThis.document;
  try {
    if (typeof portfolioId !== 'string' || !portfolioId) return false;     // the server validates the uuid itself
    if (inFlight.has(portfolioId)) return false;
    if (readSeen(storage).includes(portfolioId)) return false;     // this browser already registered this portfolio

    inFlight.add(portfolioId);
    try {
      const visitorId = getVisitorId(storage, doc);                // null is fine for a signed-in visitor (server ignores it)
      const { data, error } = await supabase.rpc('record_portfolio_view', { p_portfolio_id: portfolioId, p_visitor_id: visitorId });
      if (error) return false;                                     // not marked: a later visit may try again
      if (data === true || visitorId) markSeen(storage, portfolioId);
      return data === true;
    } finally {
      inFlight.delete(portfolioId);
    }
  } catch (_) {
    return false;
  }
}
