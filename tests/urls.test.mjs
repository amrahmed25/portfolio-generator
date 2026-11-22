// Tests for the /u/{user_handle}/{portfolio_number} URL scheme.
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { bundle, bundleSource, seed, openPage, sleep } from './harness.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const U = await import(pathToFileURL(ROOT + 'js/portfolio-url.js').href);
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };

// ---------- pure helpers ----------
ok(U.toPublicNumber(0) === 1 && U.toPublicNumber(4) === 5, 'U1 DB number 0 is shown as 1 (URLs are 1-based)');
for (const [seg, want] of [['1', 0], ['2', 1], ['10', 9], ['0', null], ['01', null], ['-1', null], ['1.5', null], ['abc', null], ['', null], ['1e3', null], [' 1', null], ['99999999999', null]])
  ok(U.fromPublicNumber(seg) === want, `U2 fromPublicNumber(${JSON.stringify(seg)}) = ${want}`, String(U.fromPublicNumber(seg)));
const vercel = { origin: 'https://site.vercel.app', hostname: 'site.vercel.app', pathname: '/dashboard.html' };
const local = { origin: 'http://localhost:8080', hostname: 'localhost', pathname: '/dashboard.html' };
ok(U.buildPublicUrl({ user_handle: 'aammr', portfolio_number: 0, slug: 'x' }, vercel) === 'https://site.vercel.app/u/aammr/1', 'U3 first portfolio -> /u/aammr/1');
ok(U.buildPublicUrl({ user_handle: 'aammr', portfolio_number: 1 }, vercel) === 'https://site.vercel.app/u/aammr/2', 'U4 second -> /u/aammr/2');
ok(U.buildPublicUrl({ user_handle: 'aammr', portfolio_number: 2 }, vercel) === 'https://site.vercel.app/u/aammr/3', 'U5 third -> /u/aammr/3');
ok(U.buildPublicUrl({ user_handle: 'AAMMR', portfolio_number: 0 }, vercel).endsWith('/u/aammr/1'), 'U6 handle is lower-cased');
ok(U.buildPublicUrl({ user_handle: 'aammr', portfolio_number: 0 }, local) === 'http://localhost:8080/public-portfolio.html?u=aammr&n=1', 'U7 hosts without rewrites use the query form');
ok(U.buildPublicUrl('old-slug', vercel) === 'https://site.vercel.app/u/old-slug', 'U8 a plain slug still builds the legacy URL');
ok(U.buildPublicUrl({ slug: 'old-slug', user_handle: null, portfolio_number: 0 }, vercel).endsWith('/u/old-slug'), 'U9 missing handle falls back to the slug URL (never /u/null/1)');
ok(!U.buildPublicUrl({ user_handle: 'aammr', portfolio_number: 0 }, vercel).includes('-'.repeat(1) + 'undefined'), 'U10 no undefined in URLs');
for (const [path_, search, want] of [
  ['/u/aammr/1', '', { handle: 'aammr', rawNumber: '1' }], ['/u/AAMMR/2/', '', { handle: 'aammr', rawNumber: '2' }],
  ['/u/old-slug', '', { slug: 'old-slug' }], ['/public-portfolio.html', '?u=aammr&n=3', { handle: 'aammr', rawNumber: '3' }],
  ['/public-portfolio.html', '?u=old-slug', { slug: 'old-slug' }], ['/u/aammr/abc', '', { handle: 'aammr', rawNumber: 'abc' }], ['/public-portfolio.html', '', null]])
  ok(JSON.stringify(U.parseRoute(path_, search)) === JSON.stringify(want), `U11 parseRoute(${path_}${search})`, JSON.stringify(U.parseRoute(path_, search)));

// ---------- public page against the mock DB ----------
const code = await bundle('js/public-portfolio.js');
function world() {
  const db = seed(); const base = db.portfolios[0];
  const mk = (id, user, slug, n, headline, pub = true) => ({ ...base, id, user_id: user, slug, portfolio_number: n, headline, is_published: pub, title: headline });
  db.portfolios = [mk('P1', 'U1', 'u1abc-demo-x1y2', 0, 'Alpha'), mk('P1b', 'U1', 'u1-second', 1, 'Beta'), mk('P1c', 'U1', 'u1-third', 2, 'Gamma-draft', false), mk('P2', 'U2', 'u2-first', 0, 'OtherFirst')];
  return db;
}
const load = async (db, p, user = null, search = '') => { const pg = await openPage('public-portfolio.html', search, db, user, code, p); await sleep(350); return pg; };
const frame = p => p.doc.getElementById('portfolio-frame');
const vis = (p, id) => p.doc.getElementById(id).classList.contains('visible');
const has = (p, t) => !!frame(p) && frame(p).srcdoc.includes(t);
{
  const db = world();
  let p = await load(db, '/u/user-one/1'); ok(has(p, 'Alpha') && !has(p, 'Beta'), '1 /u/user-one/1 loads the first portfolio');
  p = await load(db, '/u/user-one/2'); ok(has(p, 'Beta') && !has(p, 'Alpha'), '2 /u/user-one/2 loads the second portfolio');
  p = await load(db, '/u/other-user/1'); ok(has(p, 'OtherFirst') && !has(p, 'Alpha'), '3 a different user can also have portfolio 1 (and gets their own)');
  for (const bad of ['/u/user-one/0', '/u/user-one/abc', '/u/user-one/01', '/u/user-one/1.5', '/u/user-one/-1', '/u/user-one/99', '/u/user-one/99999999999', '/u/nobody/1', '/u/other-user/2'])
    { p = await load(db, bad); ok(!frame(p) && vis(p, 'state-not-found'), `4 invalid/unknown ${bad} -> not-found page`); }
  p = await load(db, '/u/user-one/3'); ok(!frame(p) && vis(p, 'state-not-found'), '4b unpublished portfolio is not-found for visitors');
  p = await load(db, '/u/user-one/3', { id: 'U1', user_metadata: {} }); ok(!frame(p) && vis(p, 'state-not-published'), '4c owner gets the not-published notice');
  p = await load(db, '/u/user-one/3', { id: 'U2', user_metadata: {} }); ok(!frame(p) && vis(p, 'state-not-found'), '4d another signed-in user cannot see it either');
  p = await load(db, '/u/USER-ONE/1'); ok(has(p, 'Alpha'), '4e handle matching is case-insensitive');
  const v0 = db.portfolios[0].view_count; p = await load(db, '/u/user-one/1'); ok(db.portfolios[0].view_count === v0 + 1, '5 a view is counted for the resolved portfolio');
  p = await load(db, '/u/user-one/1'); ok(p.doc.querySelector('link[rel=canonical]')?.href.endsWith('u=user-one&n=1'), '5b canonical link + share URL point at handle/number');
}
{ // old slug URLs
  const db = world();
  let p = await load(db, '/u/u1abc-demo-x1y2'); ok(has(p, 'Alpha'), '6 old /u/<slug> URL still loads the portfolio');
  ok(p.w.location.search.includes('u=user-one') && p.w.location.search.includes('n=1'), '6b ...and the address bar is canonicalised to handle/number', p.w.location.href);
  p = await load(db, '/u/nope-slug'); ok(vis(p, 'state-not-found'), '6c unknown slug -> not found');
  p = await load(db, '', null, '?u=u1-second'); ok(has(p, 'Beta') && p.w.location.search.includes('n=2'), '6d legacy ?u=<slug> form works and is canonicalised');
}
{ // handle change
  const db = world(); db.profiles[0].user_handle = 'brand-new';
  let p = await load(db, '/u/brand-new/1'); ok(has(p, 'Alpha') && db.portfolios[0].user_id === 'U1', '7 after a handle change the new URL loads the same portfolio, ownership intact');
  p = await load(db, '/u/user-one/1'); ok(vis(p, 'state-not-found'), '7b the previous handle no longer resolves');
  p = await load(db, '/u/u1abc-demo-x1y2'); ok(has(p, 'Alpha') && p.w.location.search.includes('brand-new'), '7c the old slug link is canonicalised to the NEW handle');
}
{ // deleted + new number
  const db = world(); db.portfolios = db.portfolios.filter(x => x.id !== 'P1b'); db.__counters = { U1: 3, U2: 1 };
  let p = await load(db, '/u/user-one/2'); ok(vis(p, 'state-not-found'), '8 deleted portfolio -> not found');
  const sc = await bundleSource(`import { createPortfolio, publicUrl } from './js/portfolio-service.js'; window.__t = { createPortfolio, publicUrl };`);
  const w = (await openPage('index.html', '', db, { id: 'U1', user_metadata: {} }, sc)).w;
  const id = await w.__t.createPortfolio({ user: { id: 'U1' }, title: 'Fresh' });
  const row = db.portfolios.find(x => x.id === id);
  ok(row.portfolio_number === 3, '9 a new portfolio gets the next number (3), not a reused one', String(row.portfolio_number));
  ok(w.__t.publicUrl({ user_handle: 'user-one', portfolio_number: row.portfolio_number }).endsWith('n=4'), '9b ...and its public URL ends in 4 (1-based)');
}

// ---------- config + generated links ----------
import fs from 'fs';
const vj = JSON.parse(fs.readFileSync(ROOT + 'vercel.json', 'utf8'));
const rw = vj.rewrites.map(r => r.source);
ok(rw[0] === '/u/:handle/:number' && rw.includes('/u/:slug') && rw.indexOf('/u/:handle/:number') < rw.indexOf('/u/:slug'), '10 vercel.json rewrites /u/:handle/:number (and the legacy /u/:slug) to the public page');
ok(vj.rewrites.every(r => r.destination.startsWith('/public-portfolio.html?u=')), '10b rewrite destinations are the public page');
ok(/\/u\/:handle\/:number\s+\/public-portfolio\.html\?u=:handle&n=:number\s+200/.test(fs.readFileSync(ROOT + '_redirects', 'utf8')), '10c Netlify _redirects has the same rule');
const html = fs.readFileSync(ROOT + 'public-portfolio.html', 'utf8');
const re = new RegExp(html.match(/path\.match\((\/.*\/)\)/)[1].slice(1, -1));
ok(['/u/a/1', '/u/a/abc', '/u/a'].every(x => re.exec(x)?.[1] === '/'), '10d <base> is resolved to the site root for 1- and 2-segment URLs (assets load on refresh)');
for (const f of ['js/dashboard.js', 'js/portfolio-builder.js', 'js/explore.js', 'js/community.js'])
  ok(!/publicUrl\((?:pf\.slug|slug|portfolio\.slug|state\.portfolio\.slug)\)/.test(fs.readFileSync(ROOT + f, 'utf8')), `11 ${f} no longer builds public links from a bare slug`);
{ // explore cards link to handle/number
  const { bundleCall } = await import('./harness.mjs');
  const db = seed(); const ex = await bundleCall('js/explore.js', 'init');
  const p = await openPage('explore.html', '', db, null, ex); await sleep(400);
  const hrefs = [...p.doc.querySelectorAll('.portfolio-card-cover-link')].map(a => a.href);
  ok(hrefs.length > 0 && hrefs.some(h => h.endsWith('u=other-user&n=1')), '12 explore card links use handle/number', hrefs.join(' | '));
  ok(hrefs.every(h => !h.includes('undefined') && !h.includes('null')), '12b no explore link contains undefined/null');
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
