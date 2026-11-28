'use strict';
/**
 * POST /api/contact  -  delivers a portfolio contact-form message to the portfolio owner.
 *
 * Vercel serverless function (Node, no npm dependencies). Secrets live ONLY in server-side
 * environment variables; nothing here is ever sent to the browser.
 *
 * Required environment variables (see docs/CONTACT_FORM_SETUP.md):
 *   RESEND_API_KEY     Resend API key (server-side secret)
 *   CONTACT_FROM       Verified sender, e.g.  PortfolioHub <contact@your-domain.com>
 *   SUPABASE_URL       Same project URL the frontend uses
 *   SUPABASE_ANON_KEY  The PUBLIC anon/publishable key (RLS already limits it to published portfolios)
 * Optional:
 *   ALLOWED_ORIGINS    Comma-separated extra origins allowed to call this endpoint
 *   RESEND_API_URL     Override for tests (default https://api.resend.com/emails)
 *   CONTACT_TIMEOUT_MS Provider timeout in ms (default 5000; lookup is capped at 4000). Together they stay
 *                      under Vercel's default 10 s function limit.
 *
 * Security properties:
 *   - The recipient is NEVER read from the request. It is looked up from the portfolio row
 *     (contact_email of a PUBLISHED portfolio) identified by a UUID.
 *   - Same-origin only (Origin header must match this host or ALLOWED_ORIGINS).
 *   - Strict server-side validation; control characters (CR/LF) are stripped from every
 *     single-line field, so header injection is impossible; visitor text is HTML-escaped.
 *   - Honeypot field, per-IP and per-portfolio rate limits (best effort, see docs), body size cap.
 *   - Success is returned ONLY after the provider accepted the message (HTTP 2xx + message id).
 */

const crypto = require('crypto');

const LIMITS = { name: 100, email: 254, subject: 150, message: 5000, body: 20 * 1024 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"',;:\\()[\]]{1,64}@[^\s@<>"',;:\\()[\]]+\.[A-Za-z]{2,}$/;

/* ----------------------------- rate limiting (in-memory, best effort) ----------------------------- */
// Serverless instances are short-lived and not shared, so this only slows down abuse that hits the same
// warm instance. For hard guarantees add a Vercel WAF rate-limit rule or Upstash (see docs).
const buckets = new Map();
const RATE = { ipWindowMs: 10 * 60 * 1000, ipMax: 5, portfolioWindowMs: 60 * 60 * 1000, portfolioMax: 30 };

function hit(key, windowMs, max, now) {
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return Math.ceil((windowMs - (now - arr[0])) / 1000); }
  arr.push(now); buckets.set(key, arr);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 3600e3) buckets.delete(k);
  return 0;
}

/* ----------------------------------------- helpers ----------------------------------------- */
// Only real strings are accepted: an object/array/number is treated as empty, never coerced ("[object Object]").
const asText = v => (typeof v === 'string' ? v : '');
const oneLine = (v, max) => asText(v).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max + 1);
const multiLine = (v, max) => asText(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, '').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, max + 1);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
const fail = (res, status, code, error, extra = {}, headers) => send(res, status, { ok: false, code, error, ...extra }, headers);

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else raw = await new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > LIMITS.body) { reject(Object.assign(new Error('too large'), { code: 'TOO_LARGE' })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
  if (Buffer.byteLength(raw) > LIMITS.body) throw Object.assign(new Error('too large'), { code: 'TOO_LARGE' });
  return JSON.parse(raw);
}

function originAllowed(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const allowed = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
  if (host) { allowed.add('https://' + host); if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) allowed.add('http://' + host); }

  // 1. An Origin header, when present, must be ours ("null" from a sandboxed iframe is rejected: the
  //    portfolio must go through the parent-page relay).
  const origin = String(req.headers.origin || '');
  if (origin) return allowed.has(origin);
  // 2. Browsers do not always send Origin on same-origin requests (Chrome omits it), but they always send
  //    Sec-Fetch-Site, and page scripts cannot forge it.
  const site = String(req.headers['sec-fetch-site'] || '');
  if (site) return site === 'same-origin';
  // 3. Last resort for old browsers: the Referer's origin.
  try { return allowed.has(new URL(String(req.headers.referer || '')).origin); } catch (_) { return false; }
}

const clientIp = req => String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();

async function fetchWithTimeout(url, opts, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}

/** Reads the owner's contact address from a PUBLISHED portfolio. The caller never supplies it. */
async function lookupRecipient(portfolioId) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY;
  const url = `${base}/rest/v1/portfolios?id=eq.${encodeURIComponent(portfolioId)}&is_published=eq.true&select=title,contact_email&limit=1`;
  const r = await fetchWithTimeout(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } }, Math.min(4000, Number(process.env.CONTACT_TIMEOUT_MS) || 4000));
  if (!r.ok) throw Object.assign(new Error('lookup failed ' + r.status), { code: 'LOOKUP' });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function buildMessage({ name, email, subject, message, portfolioTitle }) {
  const subj = oneLine(`Portfolio contact: ${name}${subject ? ' - ' + subject : ''}`, 200);
  const text = [`You received a new message through your portfolio${portfolioTitle ? ` "${portfolioTitle}"` : ''}.`, '',
    `Name:    ${name}`, `Email:   ${email}`, `Subject: ${subject || '(none)'}`, '', 'Message:', message, '',
    '---', 'Reply to this email to answer the visitor directly (the Reply-To header is their address).'].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>You received a new message through your portfolio${portfolioTitle ? ` <strong>${esc(portfolioTitle)}</strong>` : ''}.</p>
<table cellpadding="4" style="border-collapse:collapse"><tr><td><strong>Name</strong></td><td>${esc(name)}</td></tr>
<tr><td><strong>Email</strong></td><td>${esc(email)}</td></tr><tr><td><strong>Subject</strong></td><td>${esc(subject || '(none)')}</td></tr></table>
<p style="white-space:pre-wrap;border-left:3px solid #ccc;margin:12px 0;padding:4px 12px">${esc(message)}</p>
<p style="color:#666;font-size:13px">Reply to this email to answer the visitor directly.</p></div>`;
  return { subj, text, html };
}

/* ------------------------------------------- handler ------------------------------------------- */
async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method', 'Method not allowed.', {}, { Allow: 'POST' });
  if (!originAllowed(req)) return fail(res, 403, 'origin', 'Request not allowed.');
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return fail(res, 415, 'content_type', 'Expected JSON.');
  if (Number(req.headers['content-length'] || 0) > LIMITS.body) return fail(res, 413, 'too_large', 'Message is too large.');

  // Not configured -> an honest failure, never a fake success.
  const cfg = process.env;
  if (!cfg.RESEND_API_KEY || !cfg.CONTACT_FROM || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.error('[contact] server is not configured (missing environment variables)');
    return fail(res, 503, 'not_configured', 'The contact service is not available right now.');
  }

  const now = Date.now(), ip = clientIp(req);
  let wait = hit('ip:' + ip, RATE.ipWindowMs, RATE.ipMax, now);
  if (wait) return fail(res, 429, 'rate_limited', 'Too many messages. Please try again later.', {}, { 'Retry-After': String(wait) });

  let body;
  try { body = await readJson(req); }
  catch (e) { return e && e.code === 'TOO_LARGE' ? fail(res, 413, 'too_large', 'Message is too large.') : fail(res, 400, 'bad_json', 'Invalid request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'bad_json', 'Invalid request.');

  // Honeypot: a real visitor never sees or fills this field. Rejected, not "accepted".
  if (body.website) return fail(res, 400, 'rejected', 'Failed to send message.');

  // NOTE: any "to"/"recipient"/"cc"/"bcc"/"from" the client sends is ignored: only these fields are read.
  const portfolioId = asText(body.portfolio_id).trim();
  const name = oneLine(body.name, LIMITS.name);
  const email = oneLine(body.email, LIMITS.email);
  const subject = oneLine(body.subject, LIMITS.subject);
  const message = multiLine(body.message, LIMITS.message);

  const fields = {};
  if (!UUID_RE.test(portfolioId)) return fail(res, 400, 'bad_portfolio', 'This portfolio could not be identified.');
  if (!name) fields.name = 'Please enter your name.'; else if (name.length > LIMITS.name) fields.name = `Your name must be at most ${LIMITS.name} characters.`;
  if (!email) fields.email = 'Please enter your email address.'; else if (email.length > LIMITS.email || !EMAIL_RE.test(email)) fields.email = 'Please enter a valid email address.';
  if (subject.length > LIMITS.subject) fields.subject = `The subject must be at most ${LIMITS.subject} characters.`;
  if (!message) fields.message = 'Please write a message.'; else if (message.length > LIMITS.message) fields.message = `Your message must be at most ${LIMITS.message} characters.`;
  if (Object.keys(fields).length) return fail(res, 400, 'validation', Object.values(fields)[0], { fields });

  wait = hit('p:' + portfolioId, RATE.portfolioWindowMs, RATE.portfolioMax, now);
  if (wait) return fail(res, 429, 'rate_limited', 'This portfolio is receiving too many messages. Please try again later.', {}, { 'Retry-After': String(wait) });

  let row;
  try { row = await lookupRecipient(portfolioId); }
  catch (e) { console.error('[contact] recipient lookup failed:', e.code || e.name); return fail(res, 502, 'lookup_failed', 'Failed to send message. Please try again.'); }
  if (!row) return fail(res, 404, 'portfolio_unavailable', 'This portfolio is not available.');
  const recipient = oneLine(row.contact_email, LIMITS.email);
  if (!EMAIL_RE.test(recipient)) return fail(res, 422, 'no_recipient', 'This portfolio is not accepting messages.');

  const { subj, text, html } = buildMessage({ name, email, subject, message, portfolioTitle: oneLine(row.title, 120) });
  const idem = crypto.createHash('sha256').update([portfolioId, email.toLowerCase(), subject, message, Math.floor(now / 300000)].join('\u0001')).digest('hex');

  let r;
  try {
    r = await fetchWithTimeout(cfg.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
      body: JSON.stringify({ from: cfg.CONTACT_FROM, to: [recipient], reply_to: email, subject: subj, text, html })
    }, Number(cfg.CONTACT_TIMEOUT_MS) || 5000);
  } catch (e) {
    console.error('[contact] provider unreachable:', e.name);
    return fail(res, 502, 'provider_unreachable', 'Failed to send message. Please try again.');
  }

  let data = null; try { data = await r.json(); } catch (_) { /* non-JSON error body */ }
  if (!r.ok || !data || !data.id) {
    // Log the provider status/name (never the key or message content); show the visitor a generic error.
    console.error('[contact] provider rejected the message:', r.status, data && (data.name || data.error || data.message));
    return fail(res, r.status === 429 ? 503 : 502, 'provider_error', 'Failed to send message. Please try again.');
  }
  return send(res, 200, { ok: true, code: 'sent' });
}

module.exports = handler;
module.exports._resetRateLimits = () => buckets.clear();
module.exports._EMAIL_RE = EMAIL_RE;
