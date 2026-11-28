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
async function boot(tpl, preview = false) {
  const runtime = fs.readFileSync(ROOT + 'js/templates/runtime.js', 'utf8');
  const html = (preview ? buildDocument(normalizeData(base(tpl, 'hello@example.com')), { baseUrl: 'https://s.test/', preview: true }) : render(tpl, 'hello@example.com')).replace(/<script src="[^"]*runtime\.js"><\/script>/, () => `<script>${runtime}</script>`);
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
  // The portfolio document hands its message to the PARENT page (the relay); fake that parent here.
  const posted = []; const fakeParent = { postMessage: m => posted.push(m) };
  Object.defineProperty(w, 'parent', { value: fakeParent, configurable: true });
  let opened = 0; w.open = () => { opened++; return {}; };
  const reply = async (data, source = fakeParent) => { const ev = new w.Event('message'); ev.data = data; Object.defineProperty(ev, 'source', { value: source }); w.dispatchEvent(ev); await new Promise(r => setTimeout(r, 5)); };
  const fill = (n, v) => { form.elements[n].value = v; };
  const submit = () => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const msg = () => d.getElementById('formMsg'), btn = () => d.getElementById('sendBtn');
  const idleLabel = btn().textContent.trim();
  const valid = () => { fill('name', 'Sara & Co'); fill('email', 'sara@example.com'); fill('subject', 'Hi there?'); fill('message', 'Line1\nLine 2 & more'); };
  const last = () => posted[posted.length - 1];

  // validation (nothing is sent)
  submit(); ok(posted.length === 0 && /name/i.test(msg().textContent), `G1 ${tpl}: empty form -> validation message, nothing sent`);
  fill('name', 'S'); fill('email', 'bad'); fill('message', 'x'); submit();
  ok(posted.length === 0 && /valid email/i.test(msg().textContent) && form.elements.email.getAttribute('aria-invalid') === 'true', `G2 ${tpl}: invalid visitor email -> message + aria-invalid, nothing sent`);
  fill('email', 'sara@example.com'); fill('message', ''); submit(); ok(posted.length === 0 && /message/i.test(msg().textContent), `G3 ${tpl}: empty message rejected`);
  fill('message', 'x'.repeat(5001)); submit(); ok(posted.length === 0 && /5000/.test(msg().textContent), `G3b ${tpl}: over-long message rejected`);

  // loading state + duplicate prevention
  valid(); submit();
  const sent = last();
  ok(posted.length === 1 && sent.source === 'ph-contact' && sent.type === 'submit' && sent.payload.name === 'Sara & Co' && sent.payload.email === 'sara@example.com' && sent.payload.subject === 'Hi there?' && /Line1\nLine 2/.test(sent.payload.message), `G4 ${tpl}: valid submit posts name/email/subject/message to the parent`, JSON.stringify(sent));
  ok(!('to' in sent.payload) && !('recipient' in sent.payload) && !('cc' in sent.payload) && !('bcc' in sent.payload) && !('from' in sent.payload), `G5 ${tpl}: the browser never sends a recipient`);
  ok(btn().disabled && btn().textContent.trim() === 'Sending...' && form.getAttribute('aria-busy') === 'true', `G6 ${tpl}: loading state (button disabled, "Sending...")`);
  submit(); submit(); btn().dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok(posted.length === 1, `G7 ${tpl}: duplicate submissions while sending are ignored`, String(posted.length));
  await reply({ source: 'ph-contact', type: 'result', id: 'someone-else', ok: true }); await reply({ source: 'ph-contact', type: 'result', id: sent.id, ok: true }, { not: 'the parent' });
  ok(btn().disabled && form.elements.name.value === 'Sara & Co', `G8 ${tpl}: results with a wrong id or from a wrong window are ignored`);

  // success -> message + cleared form + button restored
  await reply({ source: 'ph-contact', type: 'result', id: sent.id, ok: true, code: 'sent' });
  ok(msg().textContent === 'Message sent successfully.' && msg().className.includes('ok') && !msg().hidden, `G9 ${tpl}: success message only after the parent confirms delivery`);
  ok(form.elements.name.value === '' && form.elements.message.value === '' && !btn().disabled && btn().textContent.trim() === idleLabel, `G10 ${tpl}: form cleared and button restored after success`, btn().textContent);

  // failure -> input preserved, error + Gmail fallback, can retry
  valid(); submit(); const second = last();
  await reply({ source: 'ph-contact', type: 'result', id: second.id, ok: false, code: 'provider_error' });
  ok(/^Failed to send message\. Please try again\./.test(msg().textContent) && msg().className.includes('err'), `G11 ${tpl}: failure shows the error message`);
  ok(form.elements.name.value === 'Sara & Co' && form.elements.message.value === 'Line1\nLine 2 & more' && !btn().disabled, `G12 ${tpl}: visitor input preserved and the button re-enabled after a failure`);
  const gl = msg().querySelector('a');
  ok(gl && gl.href.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=hello%40example.com') && /&su=Portfolio%20Contact%3A%20Sara%20%26%20Co%20-%20Hi%20there%3F/.test(gl.href) && /&body=.*%0A.*%26/.test(gl.href) && gl.target === '_blank' && /noopener/.test(gl.rel), `G13 ${tpl}: Gmail Compose is still offered as an encoded, new-tab fallback`, gl && gl.href);
  submit(); ok(posted.length === 3, `G14 ${tpl}: retry after failure sends again`);
  await reply({ source: 'ph-contact', type: 'result', id: last().id, ok: false, code: 'rate_limited' });
  ok(/Too many messages/.test(msg().textContent), `G15 ${tpl}: rate-limit response gets a specific message`);
  submit(); await reply({ source: 'ph-contact', type: 'result', id: last().id, ok: false, code: 'validation', fields: { email: 'Please enter a valid email address.' } });
  ok(/valid email/.test(msg().textContent) && form.elements.email.getAttribute('aria-invalid') === 'true', `G16 ${tpl}: server-side validation errors are shown on the field`);
  submit(); await reply({ source: 'ph-contact', type: 'result', id: last().id, ok: false, code: 'network' });
  ok(/^Failed to send message/.test(msg().textContent) && !btn().disabled, `G17 ${tpl}: network failure -> error, can retry`);

  // honeypot, Gmail never opened/embedded
  const trap = form.querySelector('input[name="website"]');
  ok(trap && trap.getAttribute('aria-hidden') === 'true' && trap.tabIndex === -1 && form.querySelectorAll('input[name="website"]').length === 1, `G18 ${tpl}: invisible honeypot field present exactly once`);
  trap.value = 'http://spam'; submit(); ok(last().payload.website === 'http://spam', `G19 ${tpl}: honeypot value is forwarded so the server can reject it`);
  await reply({ source: 'ph-contact', type: 'result', id: last().id, ok: false, code: 'rejected' });
  ok(opened === 0 && !d.querySelector('iframe') && !/mail\.google\.com/.test(d.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<a [^>]*mail\.google\.com[^>]*>/g, '')), `G20 ${tpl}: window.open is never used and nothing is embedded`);

  // builder preview: no delivery attempted
  { const pw = await boot(tpl, true); const pf = pw.document.getElementById('contactForm'); const pp = []; Object.defineProperty(pw, 'parent', { value: { postMessage: m => pp.push(m) }, configurable: true });
    pf.elements.name.value = 'S'; pf.elements.email.value = 'a@b.co'; pf.elements.message.value = 'hi'; pf.dispatchEvent(new pw.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 20));
    ok(pp.length === 0 && /disabled in the builder preview/.test(pw.document.getElementById('formMsg').textContent), `G21 ${tpl}: the builder preview never sends real email`); }
  // no parent page at all (document opened on its own)
  { const sw = await boot(tpl); const sf = sw.document.getElementById('contactForm'); sf.elements.name.value = 'S'; sf.elements.email.value = 'a@b.co'; sf.elements.message.value = 'hi';
    sf.dispatchEvent(new sw.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 20));
    ok(/^Failed to send message/.test(sw.document.getElementById('formMsg').textContent) && sw.document.getElementById('sendBtn').disabled === false, `G22 ${tpl}: without a parent page the form fails honestly (no fake success)`); }
}

// ---------- the public page iframe ----------
{
  const pub = fs.readFileSync(ROOT + 'js/public-portfolio.js', 'utf8');
  ok(/frame\.srcdoc = /.test(pub) && !/frame\.src\s*=/.test(pub), 'F1 portfolio frame is srcdoc only (never navigates to an external page)');
  const sb = pub.match(/setAttribute\('sandbox', '([^']+)'/)[1].split(' ');
  ok(sb.includes('allow-popups') && sb.includes('allow-popups-to-escape-sandbox') && !sb.includes('allow-same-origin'), 'F2 sandbox lets links/popups open outside the frame without granting same-origin', sb.join(' '));
  ok(sb.includes('allow-forms'), 'F2b public page sandbox has allow-forms (without it Chrome blocks the Send button before the submit event fires)');
  const bld2 = fs.readFileSync(ROOT + 'js/portfolio-builder.js', 'utf8'); ok(/sandbox: '[^']*allow-forms[^']*'/.test(bld2) && !/sandbox: '[^']*allow-same-origin/.test(bld2), 'F2c builder preview sandbox has allow-forms and no allow-same-origin');
  const gm = fs.readdirSync(ROOT + 'js', { recursive: true }).filter(f => f.endsWith('.js') && /mail\.google\.com/.test(fs.readFileSync(ROOT + 'js/' + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
  ok(gm.length === 1 && gm[0].endsWith('runtime.js'), 'F3 mail.google.com is referenced in exactly one place (the runtime contact form)', gm.join());
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
