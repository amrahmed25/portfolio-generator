// The Community feature is gone: no files, no links, no references, no requests.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bundleCall, bundle, seed, openPage, sleep } from './harness.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };

// ---- files
for (const f of ['community.html', 'js/community.js', 'css/community.css']) ok(!fs.existsSync(ROOT + f), `1 ${f} is deleted`);

// ---- no reference anywhere in the shipped app (the reserved-handle list may keep the word: it only blocks the name)
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === '.git' || e.name === 'tests' || e.name === 'docs' ? [] : e.isDirectory() ? walk(d + e.name + '/') : [d + e.name]);
const files = walk(ROOT).filter(f => /\.(html|js|css|json|md|svg|sql|txt)$|_redirects$/.test(f));
const offenders = files.filter(f => /community/i.test(fs.readFileSync(f, 'utf8')) && !f.endsWith('js/handle.js') && !f.endsWith('README.md')).map(f => f.replace(ROOT, ''));
ok(offenders.length === 0, `2 no file in the app mentions Community (${files.length} files scanned)`, offenders.join(', '));
const readme = fs.readFileSync(ROOT + 'README.md', 'utf8').split('\n').filter(l => /community/i.test(l));
ok(readme.length === 1 && /supabase_remove_community\.sql/.test(readme[0]), '2b the README only mentions it to point at the removal migration');
const handle = fs.readFileSync(ROOT + 'js/handle.js', 'utf8').split('\n').filter(l => /community/i.test(l));
ok(handle.length === 1 && /'community'/.test(handle[0]), '2c "community" only remains as a RESERVED handle (it blocks the name, it is not a feature)');
ok(!files.some(f => /community-images|community_posts|post-card|post-form/i.test(fs.readFileSync(f, 'utf8')) && !f.endsWith('README.md')), '2d no table, bucket or markup names from the old feature remain');
const vj = fs.readFileSync(ROOT + 'vercel.json', 'utf8') + fs.readFileSync(ROOT + '_redirects', 'utf8');
ok(!/community/i.test(vj), '2e no rewrite/redirect rule for it');

// ---- runtime: pages render without community links and without touching any community table
const U1 = { id: 'U1', user_metadata: {} };
async function page(file, entry, fn, user = U1, query = '') {
  const db = seed(); const code = fn ? await bundleCall(entry, fn) : await bundle(entry); const p = await openPage(file, query, db, user, code); await sleep(500); return { p, db };
}
{
  const { p, db } = await page('dashboard.html', 'js/dashboard.js', 'loadDashboard');
  ok(p.doc.querySelectorAll('.stats-grid .stat-card').length === 3 && !p.doc.getElementById('stat-posts'), '3 dashboard: 3 stat cards (Community Posts card removed), no posts counter');
  ok(![...p.doc.querySelectorAll('.quick-action-card')].some(a => /community/i.test(a.textContent + a.getAttribute('href'))) && p.doc.querySelectorAll('.quick-action-card').length >= 2, '3b dashboard: no "Join Community" quick action; the others remain');
  ok(!p.doc.querySelector('a[href*="community"]') && !/community/i.test(p.doc.body.textContent), '3c dashboard: no community link or text anywhere in the page');
  ok(!(db.__tables || []).some(t => /community/i.test(t)), '3d dashboard: no community table is queried', (db.__tables || []).join());
  ok(!p.errors.length, '3e dashboard: no console errors', p.errors.join(' / '));
}
{
  const { p, db } = await page('explore.html', 'js/explore.js', 'init', null);
  ok(!p.doc.querySelector('a[href*="community"]') && !/community/i.test(p.doc.body.textContent) && !(db.__tables || []).some(t => /community/i.test(t)), '4 explore: no community link, text or request');
}
{
  const { p, db } = await page('profile.html', 'js/profile.js', null);
  ok(!/community/i.test(p.doc.body.textContent) && !(db.__tables || []).some(t => /community/i.test(t)), '5 profile: copy no longer mentions community posts; no community request');
}
{
  const { p } = await page('templates.html', 'js/templates.js', 'init');
  ok(!p.doc.querySelector('a[href*="community"]') && !/community/i.test(p.doc.body.textContent), '6 templates: no community link');
}
{ // landing page: sections, nav, footer
  const html = fs.readFileSync(ROOT + 'index.html', 'utf8');
  ok(!/community/i.test(html) && (html.match(/<section\b/g) || []).length === (html.match(/<\/section>/g) || []).length, '7 landing page: no nav/footer link, feature card or preview section; markup still balanced');
  const open = (html.match(/<div\b/g) || []).length, close = (html.match(/<\/div>/g) || []).length;
  ok(open === close, '7b landing page: <div> tags balanced after the removals', `${open}/${close}`);
}
// ---- every page's shared navigation: no community link, and no broken link to a missing page
{
  const nav = fs.readFileSync(ROOT + 'js/navigation.js', 'utf8');
  ok(!/community/i.test(nav), '8 navigation (desktop + mobile menu) has no community entry');
  const pagesWithLinks = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const broken = [];
  for (const f of pagesWithLinks) for (const m of fs.readFileSync(ROOT + f, 'utf8').matchAll(/href="([a-z0-9-]+\.html)(?:[?#][^"]*)?"/g)) if (!fs.existsSync(ROOT + m[1])) broken.push(f + ' -> ' + m[1]);
  for (const f of ['js/navigation.js', 'js/dashboard.js', 'js/auth.js']) for (const m of fs.readFileSync(ROOT + f, 'utf8').matchAll(/['"`]([a-z0-9-]+\.html)(?:[?#][^'"`]*)?['"`]/g)) if (!fs.existsSync(ROOT + m[1])) broken.push(f + ' -> ' + m[1]);
  ok(broken.length === 0, '9 no link in the HTML or the navigation/dashboard/auth scripts points at a page that no longer exists', broken.join('; '));
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
