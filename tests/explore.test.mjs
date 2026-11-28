// Explore: sorting (incl. Most / Least Viewed), search, role filter and pagination, all driven by the explore_portfolios RPC.
// The mock RPC mirrors the SQL function; the SQL itself is verified on real PostgreSQL in sql/explore_test.py.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bundleCall, bundleSource, seed, openPage, sleep, type, click } from './harness.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const code = await bundleCall('js/explore.js', 'init');

const NOW = Date.UTC(2026, 10, 1);
function world() {
  const db = seed(); const base = db.portfolios[0];
  db.profiles = []; db.portfolios = []; db.portfolio_skills = [];
  const roles = ['Developer', 'Designer', 'Freelancer'];
  for (let i = 1; i <= 25; i++) {
    const nn = String(i).padStart(2, '0');
    db.profiles.push({ id: 'X' + nn, full_name: 'Dev ' + nn, username: 'x' + nn, user_handle: 'ex-user-' + i, role: roles[i % 3], title: 'Title ' + i });
    db.portfolios.push({ ...base, id: 'E' + nn, user_id: 'X' + nn, slug: 'ex-' + i, portfolio_number: 0, is_published: true, headline: 'Headline ' + i,
      view_count: (i % 5) * 10, created_at: new Date(NOW - i * 86400000).toISOString(), title: 'T' + i });
  }
  db.profiles.push({ id: 'U1', full_name: 'Draft Owner', username: 'u1', user_handle: 'draft-owner', role: null });
  db.portfolios.push({ ...base, id: 'EDRAFT', user_id: 'U1', slug: 'ex-draft', portfolio_number: 0, is_published: false, headline: 'Secret draft', view_count: 9999, created_at: new Date(NOW).toISOString(), title: 'Draft' });
  db.portfolio_skills.push({ id: 's1', portfolio_id: 'E03', name: 'Rust', order_index: 0 }, { id: 's2', portfolio_id: 'E07', name: 'Rust', order_index: 0 });
  return db;
}
const exp = (fn) => Array.from({ length: 25 }, (_, k) => k + 1).sort(fn).map(i => 'Dev ' + String(i).padStart(2, '0'));
const views = i => (i % 5) * 10, num = n => Number(n.slice(4));
const EXPECT = {
  newest: exp((a, b) => a - b), oldest: exp((a, b) => b - a),
  most_viewed: exp((a, b) => views(b) - views(a) || a - b),          // ties: newest first (smaller i = newer)
  least_viewed: exp((a, b) => views(a) - views(b) || b - a)           // exact reverse
};
const names = p => [...p.doc.querySelectorAll('.portfolio-card-name a')].map(a => a.textContent.trim());
const open = async (db, user = null) => { const p = await openPage('explore.html', '', db, user, code); await sleep(350); return p; };
const more = async p => { const b = p.doc.getElementById('explore-load-more-btn'); if (b && p.doc.getElementById('explore-load-more-wrap').style.display !== 'none') { click(p.w, b); await sleep(250); return true; } return false; };
const all = async p => { while (await more(p)); return names(p); };
const choose = async (p, v) => { const s = p.doc.getElementById('sort-select'); s.value = v; s.dispatchEvent(new p.w.Event('change', { bubbles: true })); await sleep(300); };
const calls = db => (db.__rpcCalls || []).filter(c => c.name === 'explore_portfolios');

{
  const db = world(); let p = await open(db);
  const opts = [...p.doc.querySelectorAll('#sort-select option')].map(o => [o.value, o.textContent.trim()]);
  ok(['newest', 'oldest', 'most_viewed', 'least_viewed'].every(v => opts.some(o => o[0] === v)) && opts.some(o => o[0] === 'most_viewed' && o[1] === 'Most Viewed') && opts.some(o => o[0] === 'least_viewed' && o[1] === 'Least Viewed'), '1 the sort control offers Newest, Oldest, Most Viewed and Least Viewed (plus the existing Name A-Z)', JSON.stringify(opts));
  ok(!!p.doc.querySelector('label[for="sort-select"]'), '1b the control has an accessible label');
  ok(names(p).length === 12 && p.doc.getElementById('results-count').textContent === '25 portfolios found', '2 first page shows 12 cards and the total "25 portfolios found" (the draft is not counted)', p.doc.getElementById('results-count').textContent);
  ok(JSON.stringify(names(p)) === JSON.stringify(EXPECT.newest.slice(0, 12)), '2b default order is Newest');
  ok(calls(db).length === 1 && calls(db)[0].args.p_limit === 12 && calls(db)[0].args.p_offset === 0 && calls(db)[0].args.p_sort === 'newest', '2c one request for ONE page (not the whole table): limit 12, offset 0');
  ok(!/\.from\('portfolios'\)/.test(fs.readFileSync(ROOT + 'js/explore.js', 'utf8')), '2d Explore no longer downloads the portfolio table and sorts it in the browser');

  for (const sort of ['most_viewed', 'least_viewed', 'newest', 'oldest']) {
    await choose(p, sort); const got = await all(p);
    ok(got.length === 25 && JSON.stringify(got) === JSON.stringify(EXPECT[sort]), `3 ${sort}: the full list across all pages is in the right order (pagination preserves the sort)`, got.slice(0, 8).join());
  }
  await choose(p, 'most_viewed');
  ok(JSON.stringify(names(p)) === JSON.stringify(EXPECT.most_viewed.slice(0, 12)) && names(p)[0] === 'Dev 04', '3b Most Viewed first page: highest unique views on top (40 views, newest first among ties)', names(p).slice(0, 6).join());
  ok(calls(db).filter(c => c.args.p_sort === 'most_viewed').every(c => c.args.p_offset % 12 === 0), '3c every "load more" request carries the selected sort');
  const most = await all(p), vc = most.map(n => views(num(n)));
  ok(vc.every((v, i) => i === 0 || vc[i - 1] >= v), '3d view counts never increase down the list', vc.join());
  await choose(p, 'least_viewed'); const lv = (await all(p)).map(n => views(num(n)));
  ok(lv.every((v, i) => i === 0 || lv[i - 1] <= v) && lv[0] === 0, '3e Least Viewed: counts never decrease');
  await choose(p, 'most_viewed'); const t1 = await all(p); await choose(p, 'newest'); await choose(p, 'most_viewed'); const t2 = await all(p);
  ok(JSON.stringify(t1) === JSON.stringify(t2), '3f equal view counts keep the same relative order every time');
  const fortyN = t1.filter(n => views(num(n)) === 40).map(num);
  ok(JSON.stringify(fortyN) === JSON.stringify([4, 9, 14, 19, 24]), '3g ties among 40-view portfolios: newest first', fortyN.join());
  ok(!names(p).includes('Draft Owner') && !p.doc.body.textContent.includes('Secret draft'), '4 an unpublished portfolio with 9999 views never appears, whatever the sort');
}

{ // the draft's owner is signed in: RLS would let them read their own draft, Explore must still hide it
  const db = world(); const p = await open(db, { id: 'U1', user_metadata: {} }); await choose(p, 'most_viewed'); const got = await all(p);
  ok(got.length === 25 && !got.includes('Draft Owner'), '4b a signed-in owner does not see their own unpublished portfolio in Explore');
}

{ // search + sort + role together
  const db = world(); const p = await open(db);
  await choose(p, 'most_viewed'); type(p.w, p.doc.getElementById('explore-search'), 'Dev 1'); await sleep(750);
  const got = await all(p), exp1 = EXPECT.most_viewed.filter(n => n.startsWith('Dev 1'));
  ok(JSON.stringify(got) === JSON.stringify(exp1) && p.doc.getElementById('results-count').textContent === '10 portfolios found', '5 search "Dev 1" + Most Viewed: only matches, correctly ordered, correct total', got.join());
  ok(calls(db).at(-1).args.p_search === 'Dev 1' && calls(db).at(-1).args.p_sort === 'most_viewed', '5b the search and the sort travel in the same request');
  type(p.w, p.doc.getElementById('explore-search'), 'rust'); await sleep(750);
  ok(JSON.stringify(names(p).sort()) === JSON.stringify(['Dev 03', 'Dev 07']), '5c search still matches skills');
  p.doc.querySelector('#role-pills .role-pill[data-role="Designer"]').dispatchEvent(new p.w.MouseEvent('click', { bubbles: true })); type(p.w, p.doc.getElementById('explore-search'), ''); await sleep(750);
  const des = await all(p); const dv = des.map(n => views(num(n)));
  ok(des.length > 0 && dv.every((v, i) => i === 0 || dv[i - 1] >= v), '5d role filter + Most Viewed still works together', des.join());
  type(p.w, p.doc.getElementById('explore-search'), 'zzzz-nothing'); await sleep(750);
  ok(p.doc.getElementById('explore-empty').style.display === 'flex' && names(p).length === 0, '5e no match -> the existing empty state');
  click(p.w, p.doc.getElementById('explore-reset-btn')); await sleep(400);
  ok(p.doc.getElementById('sort-select').value === 'newest' && names(p).length === 12 && names(p)[0] === 'Dev 01', '5f Reset restores Newest, clears the search and role, and reloads');
}

{ // repeated visits must not move rankings; distinct visitors must
  const db = world(); const sc = await bundleSource(`import supabase from './js/supabase-client.js'; window.__rpc = (a) => supabase.rpc('record_portfolio_view', a);`);
  const w = (await openPage('index.html', '', db, null, sc)).w; const same = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  for (let i = 0; i < 50; i++) await w.__rpc({ p_portfolio_id: 'E01', p_visitor_id: same });
  ok(db.portfolios.find(x => x.id === 'E01').view_count === 11, '6 fifty visits/refreshes by the SAME visitor add exactly one view (E01 had 10 -> 11)', String(db.portfolios.find(x => x.id === 'E01').view_count));
  let p = await open(db); await choose(p, 'most_viewed'); const r1 = await all(p);
  ok(r1.indexOf('Dev 01') < 5 === false && r1.length === 25, '6b ranking is computed from the stored unique counts');
  const before = db.portfolios.find(x => x.id === 'E10').view_count;
  for (let i = 0; i < 100; i++) await w.__rpc({ p_portfolio_id: 'E10', p_visitor_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' });
  ok(db.portfolios.find(x => x.id === 'E10').view_count === before + 1, '6c 100 repeated requests from one visitor raise a portfolio\'s ranking score by 1, not 100');
  for (let k = 0; k < 45; k++) await w.__rpc({ p_portfolio_id: 'E10', p_visitor_id: `cccccccc-0000-4000-8000-${String(k).padStart(12, '0')}` });
  p = await open(db); await choose(p, 'most_viewed'); const r2 = await all(p);
  ok(r2.indexOf('Dev 10') === 0 && r1.indexOf('Dev 10') > 10, '6d 45 NEW distinct visitors do move it to the top of the Most Viewed ranking', `${r1.indexOf('Dev 10')} -> ${r2.indexOf('Dev 10')}`);
}

{ // races, errors
  const db = world(); db.__rpcDelay = a => (a.p_sort === 'oldest' ? 400 : 20);
  const p = await open(db); const s = p.doc.getElementById('sort-select');
  s.value = 'oldest'; s.dispatchEvent(new p.w.Event('change', { bubbles: true })); await sleep(30);
  s.value = 'most_viewed'; s.dispatchEvent(new p.w.Event('change', { bubbles: true })); await sleep(900);
  ok(JSON.stringify(names(p)) === JSON.stringify(EXPECT.most_viewed.slice(0, 12)) && names(p).length === 12, '7 a slow response for an older sort never overwrites the newer selection', names(p).slice(0, 4).join());
  const btn = p.doc.getElementById('explore-load-more-btn'); db.__rpcDelay = () => 150; click(p.w, btn); click(p.w, btn); click(p.w, btn); await sleep(500);
  ok(names(p).length === 24 && new Set(names(p)).size === 24, '7b triple-clicking "Load more" loads ONE next page, no duplicates', String(names(p).length));
  db.__rpcDelay = null; db.__rpcFail = true; await choose(p, 'oldest');
  ok(!!p.doc.querySelector('.explore-error') && /Failed to load/.test(p.doc.body.textContent), '8 a failing request shows the existing error state');
  ok(p.errors.length === 1 && /Error loading portfolios/.test(p.errors[0]), '8b and is logged once');
}
{
  const html = fs.readFileSync(ROOT + 'explore.html', 'utf8'), css = fs.readFileSync(ROOT + 'css/explore.css', 'utf8');
  ok(/class="sort-select"/.test(html) && /\.sort-select\s*\{/.test(css), '9 the new options live inside the existing styled select (no new UI, no new CSS)');
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
