/**
 * contact-relay.js
 * Runs on the PUBLIC portfolio page (the trusted parent of the sandboxed portfolio iframe).
 *
 * Why a relay: the portfolio lives in a sandboxed srcdoc iframe with an opaque origin. A request made
 * from inside it carries "Origin: null" and could not be authenticated as coming from this site. So the
 * iframe asks its parent to submit the form, and the parent calls POST /api/contact same-origin.
 *
 * Security notes:
 *  - Only messages whose `source` is exactly the portfolio iframe's window are accepted.
 *  - The portfolio id comes from the data this page itself loaded, never from the iframe, so the
 *    (untrusted) iframe cannot point a message at another portfolio. The recipient address is never sent
 *    from the browser at all: the server looks it up.
 *  - No secret is involved here; the email provider key exists only on the server.
 */

const TIMEOUT_MS = 20000;

/**
 * @param {{ getFrameWindow: () => Window|null|undefined, getPortfolioId: () => string|null|undefined,
 *           endpoint?: string, fetchImpl?: typeof fetch }} opts
 * @returns {() => void} detach function
 */
export function attachContactRelay({ getFrameWindow, getPortfolioId, endpoint, fetchImpl }) {
  const url = endpoint || new URL('api/contact', document.baseURI).href;
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  let inFlight = false;

  const reply = (win, id, result) => {
    try { win.postMessage({ source: 'ph-contact', type: 'result', id, ...result }, '*'); } catch (_) { /* frame gone */ }
  };

  async function onMessage(e) {
    const win = getFrameWindow();
    const d = e.data;
    if (!win || e.source !== win) return;
    if (!d || d.source !== 'ph-contact' || d.type !== 'submit' || typeof d.id !== 'string') return;

    if (inFlight) { reply(win, d.id, { ok: false, code: 'busy' }); return; }
    const portfolioId = getPortfolioId();
    const p = d.payload || {};
    if (!portfolioId) { reply(win, d.id, { ok: false, code: 'unavailable' }); return; }

    inFlight = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'omit',
        signal: ctl.signal,
        // Only these fields are forwarded. No recipient, no from, no headers.
        body: JSON.stringify({
          portfolio_id: portfolioId,
          name: String(p.name ?? ''), email: String(p.email ?? ''),
          subject: String(p.subject ?? ''), message: String(p.message ?? ''),
          website: String(p.website ?? '')
        })
      });
      let json = null; try { json = await res.json(); } catch (_) { /* not JSON */ }
      if (res.ok && json && json.ok === true) reply(win, d.id, { ok: true, code: 'sent' });
      else reply(win, d.id, { ok: false, code: (json && json.code) || 'failed', message: json && json.error, fields: json && json.fields });
    } catch (_) {
      reply(win, d.id, { ok: false, code: 'network' });     // offline, DNS failure, timeout, function unreachable
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  }

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
