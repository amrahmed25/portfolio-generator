import { bundle, bundleCall, ROOT, seed, openPage, sleep, type, click } from './harness.mjs';
import fs from 'fs';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const U1 = { id: 'U1' };
const mk = () => {
  const db = seed();
  const base = { is_published: true, template_id: 'developer', view_count: 0, created_at: '2026-01-01T00:00:00Z', sections: {} };
  db.profiles.push({ id: 'U3', full_name: 'Zed Designer', title: 'Designer', role: 'Designer', bio: 'I draw.' });
  db.portfolios[0].is_published = true; db.portfolios[0].headline = 'Frontend Developer';
  db.portfolios[0].created_at = '2026-01-10T00:00:00Z'; db.portfolios[1].created_at = '2026-01-05T00:00:00Z';
  db.profiles[0].full_name = 'Amr Ahmed'; db.profiles[0].role = 'Developer';
  db.portfolios.push({ id: 'P3', user_id: 'U3', title: 'Zed', slug: 'zed', ...base, template_id: 'creative', created_at: '2026-03-01T00:00:00Z' });
  db.portfolios.push({ id: 'P4', user_id: 'U2', title: 'Hidden', slug: 'hidden-one', ...base, is_published: false });
  db.portfolio_skills.push({ id: 's1', portfolio_id: 'P1', name: 'React', level: 90, category: 'Frontend', order_index: 0 });
  return db;
};

// ---------- gallery ----------
let code = await bundleCall('js/templates.js', 'init');
let db = mk();
let p = await openPage('templates.html', '', db, null, code); await sleep(300);
let cards = p.doc.querySelectorAll('.template-card');
ok(cards.length === 4, 'E5 gallery shows four templates', String(cards.length));
ok([...cards].every(c => c.querySelector('iframe')?.srcdoc.includes('Alex Morgan')), 'E6 every card renders a live sample preview');
ok(!p.doc.querySelector('.template-card-preview iframe').srcdoc.includes('<script src'), 'E7 thumbnails are static (no scripts)');
ok(/4 Professional Templates/.test(p.doc.querySelector('.templates-hero-badge').textContent), 'E8 hero badge count matches');
click(p.w, cards[1].querySelector('.template-preview-btn')); await sleep(50);
ok(p.doc.getElementById('template-preview-overlay').classList.contains('active') && p.doc.querySelector('.preview-modal-iframe')?.srcdoc.includes('data-template="developer"'), 'E9 preview modal opens with the chosen template');
p.doc.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(20);
ok(!p.doc.getElementById('template-preview-overlay').classList.contains('active'), 'E10 Escape closes the modal');
const before = db.portfolios.length;
click(p.w, cards[0].querySelector('.template-use-btn')); await sleep(200);
ok(db.portfolios.length === before && !!p.w.location.href, 'E11 anonymous Use Template does not write to the database');

p = await openPage('templates.html', '', db, U1, code); await sleep(300);
click(p.w, p.doc.querySelectorAll('.template-card')[2].querySelector('.template-use-btn')); await sleep(300);
const created = db.portfolios.find(x => x.user_id === 'U1' && x.id !== 'P1');
ok(created && created.template_id === 'creative' && /^[a-z0-9][a-z0-9-]{1,59}$/.test(created.slug) && created.is_published === false, 'E12 Use Template creates a draft portfolio with that template', JSON.stringify(created));
ok(db.portfolios[0].template_id === 'reference', 'E13 existing portfolio is left untouched');

// ---------- explore ----------
code = await bundleCall('js/explore.js', 'init');
db = mk();
p = await openPage('explore.html', '', db, null, code); await sleep(400);
let names = [...p.doc.querySelectorAll('.portfolio-card-name')].map(x => x.textContent.trim());
ok(names.length === 3 && names.includes('Amr Ahmed') && names.includes('Zed Designer') && names.includes('Other') && !p.doc.body.textContent.includes('Hidden'), 'X1 explore lists only published portfolios (not the draft)', names.join('|'));
ok(!p.errors.length, 'X2 no console errors while loading explore', p.errors.join(' / '));
ok(p.doc.querySelector('.portfolio-card a').href.includes('public-portfolio.html?u=') , 'X3 card links to the public page', p.doc.querySelector('.portfolio-card a').href);
ok([...p.doc.querySelectorAll('.portfolio-skill-tag')].some(x => x.textContent === 'React'), 'X4 skills come from portfolio_skills');
ok(names[0] === 'Zed Designer', 'X5 newest first by default', names.join('|'));
const search = p.doc.getElementById('explore-search');
type(p.w, search, 'react'); await sleep(700);
names = [...p.doc.querySelectorAll('.portfolio-card-name')].map(x => x.textContent.trim());
ok(names.length === 1 && names[0] === 'Amr Ahmed', 'X6 search matches skills', names.join('|'));
type(p.w, search, 'nobody-here'); await sleep(700);
ok(p.doc.getElementById('explore-empty').style.display === 'flex', 'X7 empty state shown when nothing matches');
type(p.w, search, ''); await sleep(700);
click(p.w, [...p.doc.querySelectorAll('.role-pill')].find(b => b.dataset.role === 'Designer')); await sleep(300);
names = [...p.doc.querySelectorAll('.portfolio-card-name')].map(x => x.textContent.trim());
ok(names.length === 1 && names[0] === 'Zed Designer', 'X8 role filter works', names.join('|'));
db = mk(); db.portfolios.forEach(x => { x.user_id = 'U9'; }); // break the relation target -> still no crash
for (let i = 0; i < 14; i++) db.portfolios.push({ id: 'PX' + i, user_id: 'U2', title: 't', slug: 'many-' + i, is_published: true, template_id: 'reference', created_at: `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00Z`, sections: {} });
p = await openPage('explore.html', '', db, null, code); await sleep(400);
ok(p.doc.querySelectorAll('.portfolio-card').length === 12 && p.doc.getElementById('explore-load-more-wrap').style.display === 'flex', 'X9 first page has 12 cards and Load More', String(p.doc.querySelectorAll('.portfolio-card').length));
click(p.w, p.doc.getElementById('explore-load-more-btn')); await sleep(300);
ok(p.doc.querySelectorAll('.portfolio-card').length > 12, 'X10 Load More appends the next page', String(p.doc.querySelectorAll('.portfolio-card').length));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
