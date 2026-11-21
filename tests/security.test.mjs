// Offline tests for the security / signup / email / routing changes.
// Runs against the in-memory Supabase mock: it proves CLIENT behaviour and the client/DB contract,
// NOT the real PostgreSQL grants/triggers. Those are verified with supabase_security_verification.sql.
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { bundle, bundleCall, bundleSource, seed, openPage, sleep, type } from './harness.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const { validateHandle, RESERVED_HANDLES } = await import(pathToFileURL(ROOT + 'js/handle.js').href);
const { normalizeData, buildDocument, TEMPLATES } = await import(pathToFileURL(ROOT + 'js/portfolio-renderer.js').href);
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };

// ---------- 1. handle validation ----------
const bad = { '': 'empty', 'ab': 'short', ['a'.repeat(31)]: 'long', 'Jane': 'uppercase', 'jane smith': 'space', 'jane_smith': 'underscore',
  'jane!': 'symbol', '-jane': 'leading hyphen', 'jane-': 'trailing hyphen', 'ja--ne': 'double hyphen', 'admin': 'reserved', 'login': 'reserved' };
for (const [v, why] of Object.entries(bad)) ok(!validateHandle(v).valid && !!validateHandle(v).message, `H-bad ${why}`);
for (const v of ['jane', 'jane-smith', 'a1b', 'x'.repeat(30), '123', 'user-one-2']) ok(validateHandle(v).valid, `H-good ${v}`);
ok(RESERVED_HANDLES.includes('u') && RESERVED_HANDLES.includes('dashboard'), 'H reserved list covers site routes');

// ---------- 2. signup page ----------
const signupCode = await bundleCall('js/auth.js', 'initSignupPage');
async function signup(handle, db = seed()) {
  const p = await openPage('signup.html', '', db, null, signupCode); await sleep(100);
  const g = id => p.doc.getElementById(id);
  type(p.w, g('full-name'), 'Jane Smith'); type(p.w, g('email'), 'jane@example.com');
  type(p.w, g('password'), 'Str0ng!Passw0rd'); type(p.w, g('confirm-password'), 'Str0ng!Passw0rd');
  type(p.w, g('user-handle'), handle);
  g('signup-form').dispatchEvent(new p.w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(250);
  return { p, db, err: g('user-handle-error').textContent, signups: db.__signups || [] };
}
{
  const p = await openPage('signup.html', '', seed(), null, signupCode); await sleep(100);
  const input = p.doc.getElementById('user-handle'), label = p.doc.querySelector('label[for="user-handle"]');
  ok(!!input && input.required && !!label && /handle/i.test(label.textContent), 'S1 User Handle field is visible, labelled and required');
  ok(/permanent/i.test(p.doc.getElementById('user-handle-hint').textContent) && input.getAttribute('aria-describedby').includes('user-handle-hint'), 'S2 hint explains the handle is a permanent public URL part and is linked via aria-describedby');
  ok(p.doc.getElementById('full-name') && p.doc.getElementById('role') && p.doc.getElementById('confirm-password'), 'S3 existing signup fields preserved');
}
{
  const r = await signup('jane-smith');
  ok(r.signups.length === 1 && r.signups[0].meta.user_handle === 'jane-smith', 'S4 valid handle reaches Auth metadata as user_handle', JSON.stringify(r.signups));
  ok(r.signups[0].meta.full_name === 'Jane Smith', 'S5 full_name metadata still sent');
  ok(r.db.profiles.filter(x => x.user_handle === 'jane-smith').length === 1 && r.db.profiles.length === 3, 'S6 exactly one profile created (no client-side duplicate)', String(r.db.profiles.length));
  ok(r.err === '', 'S7 no handle error on success');
}
{
  const r = await signup('user-one');
  ok(/taken/i.test(r.err) && r.signups.length === 0, 'S8 existing handle rejected before signUp is called', r.err);
}
for (const [h, re, name] of [['Jane', /lowercase/i, 'uppercase'], ['ab', /at least 3/, 'too short'], ['a'.repeat(31), /at most 30/, 'too long'], ['jane smith', /spaces/i, 'space'], ['jane$', /lowercase letters, numbers/i, 'symbol'], ['', /choose a user handle/i, 'empty'], ['admin', /reserved/i, 'reserved']]) {
  const r = await signup(h);
  ok(re.test(r.err) && r.signups.length === 0, `S9 ${name} handle rejected with a clear message and no signUp`, r.err);
}
{
  // Supabase reports a failed profile trigger only as a generic message; make sure it is shown as a
  // handle problem (never swallowed, never replaced by an auto-generated handle).
  const feCode = await bundleSource(`import { friendlyError } from './js/auth.js'; window.__fe = friendlyError;`);
  const fe = (await openPage('index.html', '', seed(), null, feCode)).w.__fe;
  ok(/handle/i.test(fe({ message: 'Database error saving new user' })), 'S10 trigger/unique failure is mapped to a handle-specific message');
  ok(/handle/i.test(fe({ message: 'duplicate key value violates unique constraint "profiles_user_handle_lower_idx"' })), 'S11 raw duplicate-key text is never shown to the user');
}

// ---------- 3. email links in every template ----------
const base = { profile: { full_name: 'Amr Ahmed' }, portfolio: { slug: 'amr', headline: 'Dev', about: 'Hello', theme_color: '#7C3AED', sections: {} },
  projects: [], skills: [{ name: 'JS', category: 'Frontend' }], experience: [], education: [], certifications: [], links: [],
  services: [{ name: 'Web apps', description: 'x', price: 500, price_label: 'From', contact_url: '' }] };
for (const id of Object.keys(TEMPLATES)) {
  const render = email => buildDocument(normalizeData({ ...base, portfolio: { ...base.portfolio, template_id: id, contact_email: email } }), { baseUrl: 'https://s.test/' });
  const doc = h => new JSDOM(h).window.document;
  let d = doc(render('hello@example.com'));
  const links = [...d.querySelectorAll('a[href^="mailto:"]')];
  ok(links.length >= 1 && links.every(a => a.getAttribute('href') === 'mailto:hello@example.com'), `E1 ${id}: every mailto link is exactly mailto:<address>`, links.map(a => a.getAttribute('href')).join('|'));
  ok(!/href=""/.test(render('hello@example.com')), `E2 ${id}: no empty hrefs`);
  for (const [bad, name] of [['', 'empty'], ['not an email', 'invalid'], ['x"onmouseover="a@b.co', 'attribute-breakout']]) {
    const h = render(bad); d = doc(h);
    ok(!/mailto:/i.test(h) && !d.querySelector('[onmouseover]'), `E3 ${id}: ${name} email renders no mailto link and no injected attribute`);
  }
}
{
  const pub = fs.readFileSync(ROOT + 'js/public-portfolio.js', 'utf8'), bld = fs.readFileSync(ROOT + 'js/portfolio-builder.js', 'utf8');
  ok(pub.includes('allow-top-navigation-to-custom-protocols') && bld.includes('allow-top-navigation-to-custom-protocols'), 'E4 public page and builder preview sandbox allow mailto: launches');
  ok(!/allow-same-origin/.test(pub + bld.slice(bld.indexOf('sandbox:'), bld.indexOf('sandbox:') + 200)), 'E5 sandbox still has no allow-same-origin');
}

// ---------- 4. public routes ----------
{
  const code = await bundle('js/public-portfolio.js');
  const db = seed(); Object.assign(db.portfolios[0], { is_published: true, slug: 'amr-ahmed', headline: 'Dev' });
  const frame = p => p.doc.getElementById('portfolio-frame'), vis = (p, id) => p.doc.getElementById(id).classList.contains('visible');
  let p = await openPage('public-portfolio.html', '', db, null, code, '/u/user-one/0'); await sleep(300);
  ok(!!frame(p), 'R1 /u/<handle>/<number> renders the portfolio'); ok(db.portfolios[0].view_count === 1, 'R2 view counted for handle route');
  p = await openPage('public-portfolio.html', '?u=user-one&n=0', db, null, code); await sleep(300); ok(!!frame(p), 'R3 ?u=<handle>&n=<number> works on hosts without rewrites');
  p = await openPage('public-portfolio.html', '', db, null, code, '/u/amr-ahmed'); await sleep(300); ok(!!frame(p), 'R4 existing /u/<slug> links still work');
  p = await openPage('public-portfolio.html', '', db, null, code, '/u/user-one/7'); await sleep(300); ok(vis(p, 'state-not-found') && !frame(p), 'R5 unknown number -> not found');
  p = await openPage('public-portfolio.html', '', db, null, code, '/u/nobody/0'); await sleep(300); ok(vis(p, 'state-not-found'), 'R6 unknown handle -> not found');
  db.portfolios[0].is_published = false;
  p = await openPage('public-portfolio.html', '', db, null, code, '/u/user-one/0'); await sleep(300); ok(!frame(p) && vis(p, 'state-not-found'), 'R7 unpublished is invisible to anonymous visitors on the handle route');
  p = await openPage('public-portfolio.html', '', db, { id: 'U1', user_metadata: {} }, code, '/u/user-one/0'); await sleep(300); ok(!frame(p) && vis(p, 'state-not-published'), 'R8 owner sees the not-published notice, never the page');
}

// ---------- 5. portfolio creation / numbering contract ----------
{
  const code = await bundleSource(`import { createPortfolio } from './js/portfolio-service.js'; import supabase from './js/supabase-client.js'; window.__t = { createPortfolio, supabase };`);
  const db = seed(); const w = (await openPage('index.html', '', db, { id: 'U1', user_metadata: {} }, code)).w;
  const { createPortfolio, supabase } = w.__t, U = { id: 'U1' };
  const nums = () => db.portfolios.filter(x => x.user_id === 'U1').map(x => x.portfolio_number).sort((a, b) => a - b);
  const a = await createPortfolio({ user: U, title: 'One' }), b = await createPortfolio({ user: U, title: 'Two' });
  ok(JSON.stringify(nums()) === '[0,1,2]', 'N1 server allocates sequential numbers after the existing 0', nums().join());
  await supabase.from('portfolios').delete().eq('id', b).eq('user_id', 'U1');
  await createPortfolio({ user: U, title: 'Three' });
  ok(JSON.stringify(nums()) === '[0,1,3]', 'N2 a deleted number is never reused', nums().join());
  const { error } = await supabase.from('portfolios').update({ portfolio_number: 0 }).eq('id', a).eq('user_id', 'U1');
  ok(!!error, 'N3 portfolio_number cannot be changed after creation');
  const { error: e2 } = await supabase.from('portfolios').update({ user_id: 'U2' }).eq('id', a).eq('user_id', 'U1');
  ok(!!e2, 'N4 user_id cannot be changed');
  const { error: e3 } = await supabase.from('profiles').update({ user_handle: 'hacked' }).eq('id', 'U1');
  ok(!!e3 && db.profiles[0].user_handle === 'user-one', 'N5 ordinary user cannot change user_handle');
  const { error: e4 } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', 'U1');
  ok(!!e4 && db.profiles[0].role === null, 'N6 ordinary user cannot change role');
  const { error: e5 } = await supabase.from('profiles').update({ full_name: 'New Name', bio: 'b' }).eq('id', 'U1');
  ok(!e5 && db.profiles[0].full_name === 'New Name', 'N7 legitimate profile edits still work');
}

// ---------- 6. static guarantees ----------
{
  const src = f => fs.readFileSync(ROOT + f, 'utf8');
  for (const f of ['js/profile.js', 'js/portfolio-builder.js', 'js/auth.js', 'js/dashboard.js', 'js/community.js']) ok(!/\.upsert\(/.test(src(f)), `X1 ${f} has no client-side upsert`);
  ok(!/service_role|SERVICE_ROLE/.test(['js/config.js', '.env.example', 'js/supabase-client.js'].map(src).join('').replace(/never put a (secret or )?service_role[^\n]*/gi, '').replace(/Never put a service_role[^\n]*/gi, '')), 'X2 no service_role key in browser code');
  ok(!/isAdmin|is_admin|\.role\s*===/.test(['js/auth.js', 'js/dashboard.js', 'js/navigation.js', 'js/community.js'].map(src).join('')), 'X3 no client-side role checks used for authorization');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
