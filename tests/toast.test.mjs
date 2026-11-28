// Toast dismissal regression tests (jsdom). The real-browser proof lives in browser_tests/toast.browser.mjs,
// because the original bug only shows up with the real stylesheet animation, which jsdom does not run.
import { bundleSource, seed, openPage, sleep } from './harness.mjs';
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const code = await bundleSource(`import { showToast } from './js/utils.js'; window.showToast = showToast;`);
const p = await openPage('index.html', '', seed(), null, code); const w = p.w, d = p.doc;
const n = () => d.querySelectorAll('.toast').length;
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

for (const t of ['error', 'success', 'warning', 'info']) {
  w.showToast('m ' + t, t, 0); await sleep(30);
  click(d.querySelector(`.toast--${t} .toast__close`)); await sleep(450);
  ok(n() === 0, `T1 ${t}: close button removes the toast`);
}
w.showToast('x', 'error', 0);
const toast = d.querySelector('.toast'), icon = toast.querySelector('.toast__icon'), btn = toast.querySelector('button.toast__close');
ok(icon.getAttribute('aria-hidden') === 'true' && !icon.textContent.includes('✕') && (toast.textContent.match(/✕/g) || []).length === 1, 'T2 error toast has a single ✕ (the close button); status icon is decorative');
ok(btn.getAttribute('type') === 'button' && btn.getAttribute('aria-label') === 'Dismiss notification', 'T3 close control is a <button type=button> with an aria-label');
toast.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(450);
ok(n() === 0, 'T4 Escape dismisses');
['a', 'b', 'c'].forEach(m => w.showToast(m, 'info', 0)); await sleep(30);
click(d.querySelectorAll('.toast__close')[1]); await sleep(450);
ok(n() === 2 && [...d.querySelectorAll('.toast__message')].map(e => e.textContent).join() === 'a,c', 'T5 dismissing one toast leaves the others');
const first = d.querySelector('.toast'); for (let i = 0; i < 5; i++) click(first.querySelector('.toast__close')); await sleep(450);
ok(n() === 1, 'T6 repeated clicks on the same toast are harmless');
w.showToast('auto', 'info', 100); await sleep(30); click([...d.querySelectorAll('.toast')].find(t => t.textContent.includes('auto')).querySelector('.toast__close')); await sleep(450);
ok(n() === 1 && p.errors.length === 0, 'T7 manual dismissal before the auto timer fires causes no error', p.errors.join());
w.showToast('timer', 'info', 100); await sleep(500);
ok(![...d.querySelectorAll('.toast')].some(t => t.textContent.includes('timer')), 'T8 auto-dismiss still works');
ok(p.errors.length === 0, 'T9 no JavaScript errors');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
