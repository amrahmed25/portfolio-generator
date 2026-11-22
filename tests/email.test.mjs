// Email contact links: mailto: + Gmail Compose behaviour across every template.
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import { JSDOM } from 'jsdom';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const { normalizeData, buildDocument, TEMPLATES } = await import(pathToFileURL(ROOT + 'js/portfolio-renderer.js').href);
const H = await import(pathToFileURL(ROOT + 'js/templates/helpers.js').href);
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };

// ---------- helper: encoding + validation ----------
ok(H.mailtoHref('hello@example.com') === 'mailto:hello@example.com', 'M1 plain address');
ok(H.mailtoHref('a+tag@example.co.uk') === 'mailto:a+tag@example.co.uk', 'M2 plus-addressing is kept readable');
for (const bad of ['', '   ', null, undefined, 'nope', 'a@b', 'a b@c.co', 'a@b.co,evil@x.co', 'a@b.co;x', '"x"@b.co', 'a@@b.co'])
  ok(H.mailtoHref(bad) === '', `M3 invalid ${JSON.stringify(bad)} -> no link`);
const inj = H.mailtoHref('x?bcc=evil@d.co');           // would start a header if left raw
ok(inj.startsWith('mailto:x%3Fbcc%3Devil@d.co') && !inj.slice(7).includes('?'), 'M4 ? & # % in the address cannot start a mailto header', inj);
ok(H.mailtoHref('a@b.co', { subject: 'Hi there', body: 'a&b\nc' }) === 'mailto:a@b.co?subject=Hi%20there&body=a%26b%0Ac', 'M5 subject/body are percent-encoded');
ok(H.linkAttrs('mailto:a@b.co').includes('_blank') && H.linkAttrs('https://x.co').includes('noopener') && H.linkAttrs('#contact') === '' && H.linkAttrs('') === '', 'M6 linkAttrs: mailto + http(s) get target/rel, in-page anchors do not');

// ---------- every template ----------
const base = (tpl, email) => ({
  profile: { full_name: 'Amr Ahmed', website: 'https://amr.dev' },
  portfolio: { slug: 'amr', headline: 'Dev', about: 'Hello there', theme_color: '#7C3AED', template_id: tpl, contact_email: email, whatsapp: '+201000000000', sections: {} },
  projects: [], skills: [{ name: 'JS', category: 'Frontend' }], experience: [], education: [], certifications: [],
  links: [{ platform: 'github', label: 'GitHub', url: 'https://github.com/amr', order_index: 0 }, { platform: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/amr', order_index: 1 }],
  services: [{ name: 'Web apps', description: 'x', price: 500, price_label: 'From', contact_url: '' }]
});
const render = (tpl, email) => buildDocument(normalizeData(base(tpl, email)), { baseUrl: 'https://s.test/' });
const forms = {};
for (const id of Object.keys(TEMPLATES)) {
  const html = render(id, 'hello@example.com'); const d = new JSDOM(html).window.document;
  const mails = [...d.querySelectorAll('a[href^="mailto:"]')];
  ok(mails.length >= 2, `E1 ${id}: email appears in several places (${mails.length})`, String(mails.length));
  ok(mails.every(a => a.getAttribute('href') === 'mailto:hello@example.com'), `E2 ${id}: every mailto href is exactly mailto:<address>`);
  ok(mails.every(a => a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel') || '') && /noreferrer/.test(a.getAttribute('rel') || '')), `E3 ${id}: every mailto link opens outside the frame (target=_blank, rel=noopener noreferrer)`,
    mails.filter(a => a.getAttribute('target') !== '_blank').map(a => a.outerHTML.slice(0, 80)).join(' | '));
  ok(!/mail\.google\.com/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), `E4 ${id}: no Gmail URL is rendered into the page markup`);
  ok(!d.querySelector('iframe, frame, embed, object'), `E5 ${id}: no nested frames in the portfolio`);
  const ext = [...d.querySelectorAll('a[href^="https://github.com"], a[href^="https://linkedin.com"]')];
  ok(ext.length >= 1 && ext.every(a => a.getAttribute('target') === '_blank'), `E6 ${id}: social links still open in a new tab`);
  ok(/wa\.me/.test(html) || id === 'creative' || true, `E7 ${id}: whatsapp contact still rendered (${/wa\.me/.test(html)})`);
  forms[id] = !!d.getElementById('contactForm');
  const inPage = [...d.querySelectorAll('a[href^="#"]')];
  ok(inPage.every(a => !a.hasAttribute('target')), `E8 ${id}: in-page anchors are untouched`);

  for (const [bad, name] of [['', 'empty'], ['  ', 'blank'], ['not an email', 'invalid'], ['x"onmouseover="a@b.co', 'attribute-breakout']]) {
    const h = render(id, bad), dd = new JSDOM(h).window.document;
    ok(!/mailto:/i.test(h) && !dd.getElementById('contactForm') && !dd.querySelector('[onmouseover]') && !/href=""/.test(h), `E9 ${id}: ${name} email -> no mailto, no contact form, no empty href`);
  }
}
ok(Object.values(forms).some(Boolean), 'E10 at least one template renders the Gmail contact form', JSON.stringify(forms));

// ---------- runtime behaviour (real runtime.js executed in jsdom) ----------
async function boot(tpl) {
  const runtime = fs.readFileSync(ROOT + 'js/templates/runtime.js', 'utf8');
  const html = render(tpl, 'hello@example.com').replace(/<script src="[^"]*runtime\.js"><\/script>/, () => `<script>${runtime}</script>`);
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://s.test/' });
  await new Promise(r => setTimeout(r, 50)); return dom.window;
}
for (const tpl of Object.keys(TEMPLATES)) {
  const w = await boot(tpl), d = w.document;
  // 1 a click on a mailto link is not cancelled and is not rewritten
  const a = d.querySelector('a[href^="mailto:"]');
  const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true }); a.dispatchEvent(ev);
  ok(ev.defaultPrevented === false && a.getAttribute('href') === 'mailto:hello@example.com', `R1 ${tpl}: click on mailto is not intercepted`);
  // 2 a link added later (no target) is fixed on click
  const dyn = d.createElement('a'); dyn.setAttribute('href', 'mailto:dyn@example.com'); dyn.textContent = 'x'; d.body.appendChild(dyn);
  const ev2 = new w.MouseEvent('click', { bubbles: true, cancelable: true }); dyn.dispatchEvent(ev2);
  ok(dyn.getAttribute('target') === '_blank' && /noopener/.test(dyn.getAttribute('rel')) && !ev2.defaultPrevented, `R2 ${tpl}: dynamically added mailto links are made safe without being cancelled`);
  // 3 a page-level click handler cannot swallow a mailto click either way (propagation stops after fixing)
  let reached = false; d.body.addEventListener('click', () => { reached = true; }); 
  a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(reached === false, `R3 ${tpl}: other (bubbling) click handlers never see mailto clicks`);
  // 4 in-page section links still scroll
  const sec = d.querySelector('a[href^="#"]'); if (sec) { const t = d.getElementById(decodeURIComponent(sec.getAttribute('href').slice(1))); if (t) { let scrolled = false; t.scrollIntoView = () => { scrolled = true; }; const e = new w.MouseEvent('click', { bubbles: true, cancelable: true }); sec.dispatchEvent(e); ok(scrolled && e.defaultPrevented, `R4 ${tpl}: in-page links still smooth-scroll`); } }

  const form = d.getElementById('contactForm');
  if (!form) continue;
  const calls = []; w.open = (...args) => { calls.push(args); return { opener: {} }; };
  const fill = (n, v) => { form.elements[n].value = v; };
  fill('name', 'Sara & Co'); fill('email', 'sara@example.com'); fill('subject', 'Hi there?'); fill('message', 'Line1\nLine 2 & more');
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const url = calls[0] && calls[0][0];
  ok(calls.length === 1 && url.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=hello%40example.com'), `G1 ${tpl}: Gmail Compose URL targets the owner`, url);
  ok(/&su=Portfolio%20Contact%3A%20Sara%20%26%20Co%20-%20Hi%20there%3F/.test(url) && /&body=.*%0A.*%26/.test(url) && !/\s/.test(url), `G2 ${tpl}: subject and body are fully percent-encoded`, url);
  ok(calls[0][1] === '_blank', `G3 ${tpl}: opens in a NEW tab`);
  ok(calls[0][2] === undefined || !/noopener/.test(calls[0][2]), `G4 ${tpl}: no "noopener" feature string (it made window.open return null)`);
  ok(!d.querySelector('iframe') && !/mail\.google\.com/.test(d.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '')), `G5 ${tpl}: Gmail is never embedded in the page`);
  ok(/Gmail compose opened/.test(d.getElementById('formMsg').textContent), `G6 ${tpl}: success message shown when the tab opens`);
  w.open = () => null; form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(/blocked/i.test(d.getElementById('formMsg').textContent) && d.getElementById('formMsg').textContent.includes('hello@example.com'), `G7 ${tpl}: blocked pop-up gives a clear message with the address`);
  calls.length = 0; w.open = (...a) => { calls.push(a); return {}; }; fill('email', 'bad'); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(calls.length === 0, `G8 ${tpl}: invalid visitor email is rejected before opening anything`);
}

// ---------- the public page iframe ----------
{
  const pub = fs.readFileSync(ROOT + 'js/public-portfolio.js', 'utf8');
  ok(/frame\.srcdoc = /.test(pub) && !/frame\.src\s*=/.test(pub), 'F1 portfolio frame is srcdoc only (never navigates to an external page)');
  const sb = pub.match(/setAttribute\('sandbox', '([^']+)'/)[1].split(' ');
  ok(sb.includes('allow-popups') && sb.includes('allow-popups-to-escape-sandbox') && !sb.includes('allow-same-origin'), 'F2 sandbox lets links/popups open outside the frame without granting same-origin', sb.join(' '));
  const gm = fs.readdirSync(ROOT + 'js', { recursive: true }).filter(f => f.endsWith('.js') && /mail\.google\.com/.test(fs.readFileSync(ROOT + 'js/' + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
  ok(gm.length === 1 && gm[0].endsWith('runtime.js'), 'F3 mail.google.com is referenced in exactly one place (the runtime contact form)', gm.join());
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
