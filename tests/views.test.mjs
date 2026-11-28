// Unique-view tracking: client behaviour against the mock (which mirrors record_portfolio_view's rules).
// The database function itself (atomicity, concurrency, blocked writes) is tested on real PostgreSQL in sql/views_test.sh.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newBrowser, bundle, bundleSource, seed, openPage, sleep } from './harness.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const code = await bundle('js/public-portfolio.js');

function world() {
  const db = seed(); const base = db.portfolios[0];
  db.portfolios = [{ ...base, id: 'P1', user_id: 'U1', slug: 'amr-ahmed', is_published: true, view_count: 7, portfolio_number: 0, title: 'One' },
                   { ...base, id: 'P3', user_id: 'U1', slug: 'second', is_published: true, view_count: 0, portfolio_number: 1, title: 'Two' },
                   { ...base, id: 'P4', user_id: 'U1', slug: 'draft', is_published: false, view_count: 0, portfolio_number: 2, title: 'Draft' }];
  db.profiles.push({ id: 'U3', full_name: 'Third', username: 'u3', user_handle: 'third-user', role: null });
  return db;
}
const visit = async (db, b, slug, user = null) => { const p = await openPage('public-portfolio.html', '', db, user, code, '/u/' + slug, b); await sleep(250); return p; };
const calls = db => (db.__rpcCalls || []).filter(c => c.name === 'record_portfolio_view');
const vc = (db, id) => db.portfolios.find(x => x.id === id).view_count;

// ---- anonymous visitors
{
  const db = world(), A = newBrowser(), B = newBrowser();
  let p = await visit(db, A, 'amr-ahmed');
  ok(vc(db, 'P1') === 8, '1 first visit by an anonymous visitor: +1 (existing count 7 is kept)', String(vc(db, 'P1')));
  ok(calls(db).length === 1 && V4.test(calls(db)[0].args.p_visitor_id) && calls(db)[0].args.p_portfolio_id === 'P1', '1b the RPC receives the portfolio id and a random UUID v4 visitor id', JSON.stringify(calls(db)[0]));
  const vid = calls(db)[0].args.p_visitor_id;
  ok(!(db.__rpcCalls || []).some(c => c.name === 'increment_view_count'), '1c the old raw counter RPC is never called');
  ok(A.local.ph_visitor_id === vid && p.w.document.cookie.includes('ph_vid=' + vid), '1d the visitor id is persisted in localStorage AND a first-party cookie');
  p = await visit(db, A, 'amr-ahmed');
  ok(vc(db, 'P1') === 8 && calls(db).length === 1, '2 refresh: no new view and not even another request', `${vc(db, 'P1')} / ${calls(db).length}`);
  p = await visit(db, A, 'amr-ahmed'); p = await visit(db, A, 'amr-ahmed');
  ok(vc(db, 'P1') === 8, '3 closing and reopening the browser (storage persists): no new view');
  // the per-portfolio "seen" marker is lost, the identity survives -> the database still refuses a second view
  delete A.local.ph_viewed; p = await visit(db, A, 'amr-ahmed');
  ok(calls(db).length === 2 && vc(db, 'P1') === 8, '3b even with the browser-side marker wiped, the DATABASE dedupes (request made, no +1)');
  // localStorage wiped but the cookie survives -> same identity recovered
  A.local = {}; p = await visit(db, A, 'amr-ahmed');
  ok(calls(db).at(-1).args.p_visitor_id === vid && vc(db, 'P1') === 8, '3c localStorage cleared but cookie kept: the SAME visitor id is recovered, no +1');
  ok(A.local.ph_visitor_id === vid, '3d ...and restored into localStorage');

  p = await visit(db, B, 'amr-ahmed');
  ok(vc(db, 'P1') === 9 && calls(db).at(-1).args.p_visitor_id !== vid, '4 a different visitor (B) counts +1 with a different id');
  p = await visit(db, B, 'amr-ahmed'); ok(vc(db, 'P1') === 9, '4b B refreshes: no new view');

  p = await visit(db, A, 'second');
  ok(vc(db, 'P3') === 1 && vc(db, 'P1') === 9, '5 visitor A on ANOTHER portfolio: that portfolio +1');
  p = await visit(db, A, 'amr-ahmed'); p = await visit(db, A, 'second');
  ok(vc(db, 'P1') === 9 && vc(db, 'P3') === 1, '5b A revisits both: no additional views');
  p = await visit(db, A, 'draft');
  ok(vc(db, 'P4') === 0 && !calls(db).some(c => c.args.p_portfolio_id === 'P4'), '6 an unpublished portfolio is never counted (and no request is made)');
}

// ---- signed-in visitors
{
  const db = world(), Ub1 = newBrowser(), Ub2 = newBrowser(), Ub3 = newBrowser();
  const U2 = { id: 'U2', user_metadata: {} }, U3 = { id: 'U3', user_metadata: {} };
  let p = await visit(db, Ub1, 'amr-ahmed', U2);
  ok(vc(db, 'P1') === 8, '7 first visit by a signed-in user: +1');
  p = await visit(db, Ub1, 'amr-ahmed', U2); ok(vc(db, 'P1') === 8, '7b refresh: no new view');
  p = await visit(db, Ub2, 'amr-ahmed', U2); ok(vc(db, 'P1') === 8, '7c the same user on another browser/device: still one view (identity = user id, not the browser)');
  p = await visit(db, Ub3, 'amr-ahmed', U3); ok(vc(db, 'P1') === 9, '8 another signed-in user: +1');
  p = await visit(db, Ub1, 'second', U2); ok(vc(db, 'P3') === 1, '8b the same signed-in user on another portfolio: +1');
  ok(db.__views.has('P1|u:U2') && db.__views.has('P1|u:U3') && ![...db.__views].some(k => k.startsWith('P1|a:') && k.includes('U2')), '8c signed-in views are keyed by user id on the server');
  // a client trying to pose as someone else: the id it sends is ignored for signed-in users
  const sent = calls(db).find(c => c.user === 'U3').args.p_visitor_id;
  ok(V4.test(sent) && !db.__views.has('P1|a:' + sent), '8d the browser-supplied id is not what identifies a signed-in visitor');
  // an anonymous visitor who later signs in on the same browser is not counted a second time
  const db2 = world(), Z = newBrowser(); await visit(db2, Z, 'amr-ahmed'); await visit(db2, Z, 'amr-ahmed', U2);
  ok(vc(db2, 'P1') === 8, '9 anonymous visit, then signs in on the same browser: still one view for that person');
}

// ---- robustness
{
  const sc = await bundleSource(`import { recordPortfolioView, getVisitorId, UUID_V4 } from './js/view-tracker.js'; window.__t = { recordPortfolioView, getVisitorId, UUID_V4 };`);
  const mk = async (db, browser) => { const w = (await openPage('index.html', '', db, null, sc, '/', browser)).w; return w.__t; };
  const supa = db => ({ rpc: async (n, a) => { (db.__rpcCalls ||= []).push({ name: n, args: a }); return { data: true, error: null }; } });

  // duplicate calls inside one page
  const db = world(); const t = await mk(db, newBrowser()); let n = 0;
  const slow = { rpc: async (name, args) => { n++; await sleep(60); return { data: true, error: null }; } };
  const res = await Promise.all(Array.from({ length: 10 }, () => t.recordPortfolioView(slow, 'P1')));
  ok(n === 1 && res.filter(Boolean).length === 1, '10 ten simultaneous calls in one page make ONE request (no duplicate counting from repeated listeners/renders)', `${n} requests, ${res.filter(Boolean).length} true`);

  // failure handling
  const store = newBrowser(); const t2 = await mk(db, store); let bad = true;
  const flaky = { rpc: async () => (bad ? { data: null, error: { message: 'boom' } } : { data: true, error: null }) };
  ok((await t2.recordPortfolioView(flaky, 'P1')) === false && !store.local.ph_viewed, '11 an RPC error is swallowed and the visit is NOT marked as recorded');
  bad = false; ok((await t2.recordPortfolioView(flaky, 'P1')) === true && JSON.parse(store.local.ph_viewed).includes('P1'), '11b a later visit retries and is recorded');
  const throwing = { rpc: async () => { throw new Error('network'); } };
  ok((await t2.recordPortfolioView(throwing, 'P3')) === false, '11c a thrown network error never escapes');
  ok((await t2.recordPortfolioView(flaky, '')) === false && (await t2.recordPortfolioView(flaky, null)) === false, '11d empty/invalid portfolio id -> no request');

  // visitor id quality and recovery
  const b = newBrowser(); const t3 = await mk(world(), b);
  const id1 = t3.getVisitorId(), id2 = t3.getVisitorId();
  ok(V4.test(id1) && id1 === id2, '12 visitor id is a UUID v4 and stable across calls', id1);
  b.local.ph_visitor_id = 'not-a-uuid'; const t4 = await mk(world(), b);
  ok(t4.getVisitorId() !== 'not-a-uuid' && V4.test(t4.getVisitorId()), '12b a tampered/invalid stored id is replaced by a fresh valid one');
  ok(t4.getVisitorId(null, null) === null, '13 storage AND cookies unavailable -> no id (the visit is not counted rather than counted on every reload)');
  const dbn = world(); const t5 = await mk(dbn, newBrowser());
  ok((await t5.recordPortfolioView(supa(dbn), 'P1', { storage: null, doc: null })) === true, '13b (a signed-in visitor can still be counted without storage: the server ignores the id)');
  const src = fs.readFileSync(ROOT + 'js/view-tracker.js', 'utf8');
  ok(/SameSite=Lax/.test(src) && /Secure/.test(src) && /Max-Age/.test(src), '14 the cookie is first-party, SameSite=Lax, Secure on https, with an expiry');
  ok(!/navigator\.userAgent|screen\.|canvas|fingerprint|ip/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '14b no fingerprinting or IP use in the tracker');
}

// ---- static guarantees
{
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const files = fs.readdirSync(ROOT + 'js', { recursive: true }).filter(f => f.endsWith('.js')).map(f => ['js/' + f, strip(fs.readFileSync(ROOT + 'js/' + f, 'utf8'))]);
  ok(!files.some(([, s]) => /increment_view_count/.test(s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))), '15 no frontend code calls the old increment_view_count');
  ok(!files.some(([, s]) => /view_count\s*:/.test(s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')) && /\.update\(\{[^}]*view_count/.test(s)), '15b no frontend code writes view_count');
  ok(files.filter(([, s]) => /record_portfolio_view/.test(s)).map(([f]) => f).join() === 'js/view-tracker.js', '16 record_portfolio_view is called from exactly one module (no duplicate view logic)');
  ok(files.filter(([, s]) => /recordPortfolioView\(/.test(s)).map(([f]) => f).sort().join() === 'js/public-portfolio.js,js/view-tracker.js', '16b and used by exactly one page: the public portfolio');
  const builder = files.find(([f]) => f === 'js/portfolio-builder.js')[1];
  ok(!/recordPortfolioView/.test(builder), '17 the builder preview never counts views');
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
