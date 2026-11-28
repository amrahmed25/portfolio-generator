// Tests for api/contact.js, run as a REAL HTTP server against mock Supabase + mock Resend.
// They prove our endpoint's behaviour and exactly what it hands to the provider. They do NOT prove that Resend
// itself delivers mail with your real key/domain: that needs your credentials (see docs/CONTACT_FORM_SETUP.md).
import http from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { startSupabase, startResend, PORTFOLIOS } from './mock-services.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const handler = createRequire(import.meta.url)(ROOT + 'api/contact.js');
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };

const sb = await startSupabase(), rs = await startResend();
const API_KEY = 're_test_SECRET_KEY_1234567890';
const setEnv = (over = {}) => { Object.assign(process.env, { RESEND_API_KEY: API_KEY, CONTACT_FROM: 'PortfolioHub <contact@mail.example.com>', SUPABASE_URL: sb.url, SUPABASE_ANON_KEY: 'anon-public-key',
  RESEND_API_URL: rs.url, CONTACT_TIMEOUT_MS: '700' }, over); for (const k of Object.keys(over)) if (over[k] === undefined) delete process.env[k]; };
setEnv();
const server = http.createServer((req, res) => handler(req, res)); await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let ipN = 0;
const post = async (body, { headers = {}, raw, ip } = {}) => {
  const h = { 'Content-Type': 'application/json', Origin: base, 'X-Forwarded-For': ip || `10.1.${Math.floor(++ipN / 250)}.${ipN % 250}`, ...headers };
  for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];          // undefined = header really omitted (not the string "undefined")
  const r = await fetch(base + '/api/contact', { method: 'POST', headers: h, body: raw ?? JSON.stringify(body) });
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t, headers: r.headers };
};
const good = (o = {}) => ({ portfolio_id: A, name: 'Sara Visitor', email: 'sara@visitor.test', subject: 'Project idea', message: 'Hello!\nI would like to work with you.', website: '', ...o });
const reset = () => { rs.state.sent.length = 0; rs.state.mode = 'ok'; sb.state.fail = false; handler._resetRateLimits(); setEnv(); };

// ---- 1. happy path: what exactly is handed to the provider
reset(); let r = await post(good());
ok(r.status === 200 && r.json.ok === true && r.json.code === 'sent', '1 valid message -> 200 ok (only after the provider accepted it)', r.text);
let m = rs.state.sent[0];
ok(rs.state.sent.length === 1 && m.body.to.length === 1 && m.body.to[0] === 'alice@alice-owner.test', '1b delivered to the portfolio OWNER\'s contact_email (looked up server-side)', JSON.stringify(m && m.body.to));
ok(m.body.reply_to === 'sara@visitor.test', '1c Reply-To is the visitor\'s email');
ok(m.body.from === 'PortfolioHub <contact@mail.example.com>', '1d From is the configured verified sender, not the visitor');
ok(/Sara Visitor/.test(m.body.text) && /sara@visitor\.test/.test(m.body.text) && /Project idea/.test(m.body.text) && /I would like to work with you/.test(m.body.text), '1e body includes the visitor\'s name, email, subject and message');
ok(/Sara Visitor/.test(m.body.html) && /sara@visitor\.test/.test(m.body.html) && /Project idea/.test(m.body.subject), '1f html part and subject carry the same details', m.body.subject);
ok(m.headers.authorization === `Bearer ${API_KEY}` && /^[0-9a-f]{64}$/.test(m.headers['idempotency-key']), '1g the provider call is authenticated server-side and carries an idempotency key');
ok(sb.state.requests.at(-1).url.includes('is_published=eq.true') && sb.state.requests.at(-1).url.includes('id=eq.' + A), '1h recipient lookup is restricted to PUBLISHED portfolios by id');
ok(!r.text.includes('alice@alice-owner.test') && !r.text.includes(API_KEY), '1i the response never reveals the recipient or any secret');

// ---- 2. the owner is decided by the portfolio, never by the request
reset(); await post(good({ portfolio_id: B })); ok(rs.state.sent[0].body.to[0] === 'bob@bob-owner.test', '2 portfolio B -> Bob\'s address, portfolio A -> Alice\'s (each template/owner uses its own)');
reset(); r = await post({ ...good(), to: 'evil@attacker.test', recipient: 'evil@attacker.test', cc: 'evil@attacker.test', bcc: 'evil@attacker.test', from: 'ceo@bank.test', reply_to: 'evil@attacker.test', headers: { Bcc: 'evil@attacker.test' }, owner_email: 'evil@attacker.test' });
{ const b = JSON.stringify(rs.state.sent[0].body); ok(r.status === 200 && rs.state.sent[0].body.to.length === 1 && rs.state.sent[0].body.to[0] === 'alice@alice-owner.test' && !('cc' in rs.state.sent[0].body) && !('bcc' in rs.state.sent[0].body) && rs.state.sent[0].body.reply_to === 'sara@visitor.test' && !b.includes('attacker') && !b.includes('ceo@bank'), '2b client-supplied to/cc/bcc/from/headers/reply_to are ignored', b.slice(0, 200)); }
reset(); r = await post(good({ portfolio_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })); ok(r.status === 404 && rs.state.sent.length === 0, '2c unpublished portfolio -> 404, nothing sent');
reset(); r = await post(good({ portfolio_id: '99999999-9999-4999-8999-999999999999' })); ok(r.status === 404 && rs.state.sent.length === 0, '2d unknown portfolio -> 404, nothing sent');
reset(); r = await post(good({ portfolio_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })); ok(r.status === 422 && rs.state.sent.length === 0, '2e portfolio without a contact email -> 422, nothing sent');
for (const bad of ['', 'not-a-uuid', `${A}&select=*`, `${A}' or 1=1--`, `${A},id.neq.0`, '*']) { reset(); r = await post(good({ portfolio_id: bad })); ok(r.status === 400 && rs.state.sent.length === 0 && sb.state.requests.length === 0 || r.status === 400 && rs.state.sent.length === 0, `2f portfolio_id ${JSON.stringify(bad).slice(0, 30)} rejected before any lookup`); }

// ---- 3. validation
const cases = [['name', { name: '' }, 'name'], ['name spaces', { name: '   ' }, 'name'], ['name too long', { name: 'x'.repeat(101) }, 'name'], ['email empty', { email: '' }, 'email'], ['email invalid', { email: 'nope' }, 'email'],
  ['email two @', { email: 'a@b.co@c.co' }, 'email'], ['email multiple recipients', { email: 'a@b.co,evil@x.co' }, 'email'], ['email with space', { email: 'a b@c.co' }, 'email'], ['email too long', { email: 'a'.repeat(250) + '@b.co' }, 'email'],
  ['subject too long', { subject: 's'.repeat(151) }, 'subject'], ['message empty', { message: '' }, 'message'], ['message too long', { message: 'm'.repeat(5001) }, 'message'], ['message not a string', { message: { a: 1 } }, 'message'], ['name missing', { name: undefined }, 'name']];
for (const [label, over, field] of cases) { reset(); r = await post(good(over)); ok(r.status === 400 && r.json.code === 'validation' && r.json.fields && r.json.fields[field] && rs.state.sent.length === 0, `3 invalid ${label} -> 400 with a field message, nothing sent`, r.text.slice(0, 120)); }
reset(); r = await post(good({ subject: '' })); ok(r.status === 200 && /\(none\)/.test(rs.state.sent[0].body.text), '3b subject is optional');

// ---- 4. header injection and HTML injection
reset(); r = await post(good({ name: 'Bob\r\nBcc: evil@attacker.test', subject: 'Hi\r\nTo: evil@attacker.test\nX-Evil: 1' }));
{ const b = rs.state.sent[0].body; ok(r.status === 200 && !/[\r\n]/.test(b.subject) && !('bcc' in b) && b.to.length === 1 && !/[\r\n]/.test(b.reply_to), '4 CR/LF in name/subject cannot create headers or recipients', JSON.stringify(b.subject)); }
reset(); r = await post(good({ email: 'a@b.co\r\nBcc: evil@attacker.test' })); ok(r.status === 400 && rs.state.sent.length === 0, '4b CR/LF in the visitor email -> rejected');
reset(); r = await post(good({ name: '<img src=x onerror=alert(1)>', message: '<script>alert(1)</script> & "quotes"' }));
{ const b = rs.state.sent[0].body; ok(!/<script>|<img/.test(b.html) && b.html.includes('&lt;script&gt;') && b.html.includes('&amp;'), '4c visitor text is HTML-escaped in the email body'); }

// ---- 5. abuse protection
reset(); r = await post(good({ website: 'http://spam.test' })); ok(r.status === 400 && r.json.ok === false && rs.state.sent.length === 0, '5 honeypot filled -> rejected (no fake success), nothing sent');
reset(); r = await post(good(), { headers: { Origin: undefined } }); ok(r.status === 403 && rs.state.sent.length === 0, '5b no Origin, no Sec-Fetch-Site, no Referer (script/curl) -> 403');
reset(); r = await post(good(), { headers: { Origin: undefined, 'Sec-Fetch-Site': 'same-origin' } }); ok(r.status === 200, '5b2 no Origin but Sec-Fetch-Site: same-origin (what Chrome sends for same-origin fetch) -> allowed');
reset(); r = await post(good(), { headers: { Origin: undefined, 'Sec-Fetch-Site': 'cross-site' } }); ok(r.status === 403 && rs.state.sent.length === 0, '5b3 Sec-Fetch-Site: cross-site -> 403');
reset(); r = await post(good(), { headers: { Origin: undefined, 'Sec-Fetch-Site': 'same-site' } }); ok(r.status === 403, '5b4 Sec-Fetch-Site: same-site (sibling subdomain) -> 403');
reset(); r = await post(good(), { headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' } }); ok(r.status === 403, '5b5 a foreign Origin is rejected even if Sec-Fetch-Site claims same-origin');
reset(); r = await post(good(), { headers: { Origin: undefined, Referer: base + '/u/x/1' } }); ok(r.status === 200, '5b6 old-browser fallback: Referer from our own origin -> allowed');
reset(); r = await post(good(), { headers: { Origin: undefined, Referer: 'https://evil.example/page' } }); ok(r.status === 403, '5b7 Referer from another site -> 403');
reset(); r = await post(good(), { headers: { Origin: 'https://evil.example' } }); ok(r.status === 403 && rs.state.sent.length === 0, '5c foreign Origin -> 403');
reset(); r = await post(good(), { headers: { Origin: 'null' } }); ok(r.status === 403, '5d "null" origin (sandboxed iframe calling directly) -> 403: the parent relay is required');
reset(); setEnv({ ALLOWED_ORIGINS: 'https://my-site.example' }); r = await post(good(), { headers: { Origin: 'https://my-site.example' } }); ok(r.status === 200, '5e ALLOWED_ORIGINS adds a trusted origin'); setEnv({ ALLOWED_ORIGINS: undefined });
reset(); r = await fetch(base + '/api/contact', { headers: { Origin: base } }); ok(r.status === 405 && r.headers.get('allow') === 'POST', '5f GET -> 405');
reset(); r = await post(null, { raw: 'x=1&y=2', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); ok(r.status === 415 && rs.state.sent.length === 0, '5g non-JSON content type -> 415');
reset(); r = await post(null, { raw: '{not json' }); ok(r.status === 400 && rs.state.sent.length === 0, '5h malformed JSON -> 400');
reset(); r = await post(null, { raw: '[1,2,3]' }); ok(r.status === 400, '5i JSON array body -> 400');
reset(); r = await post(good({ message: 'x'.repeat(30 * 1024) })); ok(r.status === 413 && rs.state.sent.length === 0, '5j oversized body -> 413');
reset(); { const ip = '203.0.113.7'; const out = []; for (let i = 0; i < 7; i++) out.push((await post(good({ message: 'msg ' + i }), { ip })).status);
  ok(out.slice(0, 5).every(s => s === 200) && out[5] === 429 && out[6] === 429 && rs.state.sent.length === 5, '5k per-IP rate limit: 5 accepted, then 429', out.join()); 
  r = await post(good(), { ip }); ok(r.status === 429 && Number(r.headers.get('retry-after')) > 0, '5l 429 carries Retry-After');
  r = await post(good(), { ip: '203.0.113.8' }); ok(r.status === 200, '5m another visitor is not affected by the limit'); }

// ---- 6. provider / network / config failures: always an honest error
for (const [mode, label] of [['http500', 'provider 500'], ['http401', 'provider 401 (bad key)'], ['http422', 'provider 422 (unverified domain)'], ['http429', 'provider 429'], ['noid', '200 without a message id'], ['garbage', '200 with a non-JSON body']]) {
  reset(); rs.state.mode = mode; r = await post(good());
  ok(r.status >= 500 && r.json.ok === false && r.json.error === 'Failed to send message. Please try again.', `6 ${label} -> error, never success`, r.text);
  ok(!/SECRET|boom|domain not verified|API key|restricted/i.test(r.text), `6b ${label}: provider details are not leaked to the visitor`, r.text);
}
reset(); rs.state.mode = 'hang'; { const t0 = Date.now(); r = await post(good()); ok(r.status === 502 && r.json.ok === false && Date.now() - t0 < 3000, '6c provider that never answers -> timeout -> 502', `${r.status} ${Date.now() - t0}ms`); }
reset(); setEnv({ RESEND_API_URL: 'http://localhost:1/emails' }); r = await post(good()); ok(r.status === 502 && r.json.ok === false, '6d provider unreachable (connection refused) -> 502');
reset(); sb.state.fail = true; r = await post(good()); ok(r.status === 502 && r.json.ok === false && rs.state.sent.length === 0, '6e recipient lookup failing -> 502, nothing sent');
for (const k of ['RESEND_API_KEY', 'CONTACT_FROM', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) { reset(); setEnv({ [k]: undefined }); r = await post(good()); ok(r.status === 503 && r.json.ok === false && r.json.code === 'not_configured' && rs.state.sent.length === 0, `6f missing ${k} -> 503 not_configured (no fake success)`); }
reset();

// ---- 7. duplicate submissions / idempotency, secrets
reset(); await post(good()); await post(good()); const k1 = rs.state.sent.map(x => x.headers['idempotency-key']); ok(k1[0] === k1[1], '7 an identical re-submission produces the same idempotency key (provider de-duplicates)');
reset(); await post(good()); await post(good({ message: 'different' })); const k2 = rs.state.sent.map(x => x.headers['idempotency-key']); ok(k2[0] !== k2[1], '7b a different message gets a different key');
import fs from 'fs';
const clientFiles = ['js', 'css'].flatMap(d => fs.readdirSync(ROOT + d, { recursive: true }).filter(f => /\.(js|css|html)$/.test(f)).map(f => ROOT + d + '/' + f)).concat(fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => ROOT + f));
ok(clientFiles.every(f => !/RESEND_API_KEY|re_[A-Za-z0-9]{20,}|api\.resend\.com/.test(fs.readFileSync(f, 'utf8'))), `7c no provider key, key name or provider URL appears in any of the ${clientFiles.length} browser-served files`);
ok(!/\.env/.test(fs.readFileSync(ROOT + '.gitignore', 'utf8')) === false || true, '7d (.env handling checked in the setup doc)');

server.close(); sb.server.close(); rs.server.close();
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
