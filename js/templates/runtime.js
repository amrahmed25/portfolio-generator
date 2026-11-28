/**
 * Runtime for rendered portfolio documents (classic script, loaded inside the
 * sandboxed preview/public iframe). Handles theme toggle, mobile nav, scroll
 * reveal and the contact form. No inline handlers are used anywhere.
 */
(function () {
  'use strict';
  var root = document.body;
  var THEME_KEY = 'ph-tpl-theme';

  function readTheme() {
    try { return window.localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function writeTheme(v) {
    try { window.localStorage.setItem(THEME_KEY, v); } catch (e) { /* storage unavailable in sandbox */ }
  }

  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    var initial = readTheme() || root.getAttribute('data-theme') || 'light';
    root.setAttribute('data-theme', initial);
    themeBtn.setAttribute('aria-pressed', String(initial === 'dark'));
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      themeBtn.setAttribute('aria-pressed', String(next === 'dark'));
      writeTheme(next);
    });
  }
  // mailto: links must never navigate THIS (sandboxed, framed) document. If the visitor's mail
  // handler is a web client such as Gmail, a frame navigation ends in "mail.google.com refused to
  // connect". So every mailto: link opens in its own browsing context (target=_blank), whether it was
  // rendered with these attributes or added later. The click is never cancelled: the browser still hands
  // the mailto: URL to the visitor's mail application / configured handler.
  function isMailLink(a) { return !!a && /^mailto:/i.test(a.getAttribute('href') || ''); }
  function openMailLinkOutside(a) {
    if (a.getAttribute('target') !== '_blank') a.setAttribute('target', '_blank');
    var rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
    ['noopener', 'noreferrer'].forEach(function (t) { if (rel.indexOf(t) === -1) rel.push(t); });
    a.setAttribute('rel', rel.join(' '));
  }
  Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) { if (isMailLink(a)) openMailLinkOutside(a); });
  // Capture phase: runs before any other click handler and does not call preventDefault().
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (isMailLink(a)) { openMailLinkOutside(a); e.stopPropagation(); }
  }, true);

  // Keep portfolio section links inside the rendered document.
document.addEventListener('click', function (e) {
  var link = e.target.closest('a[href^="#"]');
  if (!link) return;

  var hash = link.getAttribute('href');
  if (!hash || hash === '#') return;

  var target;

  try {
    target = document.getElementById(
      decodeURIComponent(hash.slice(1))
    );
  } catch (err) {
    return;
  }

  if (!target) return;

  e.preventDefault();

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });

  if (mobileNav && mobileNav.classList.contains('open')) {
    setNav(false);
  }
});

  var burger = document.getElementById('hamburgerBtn');
  var mobileNav = document.getElementById('mobileNav');
  function setNav(open) {
    if (!burger || !mobileNav) return;
    burger.classList.toggle('open', open);
    mobileNav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  if (burger && mobileNav) {
    burger.addEventListener('click', function () { setNav(!mobileNav.classList.contains('open')); });
    mobileNav.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') setNav(false);
    });
  }

  // Preview mode: reveal everything immediately, restore scroll, report scroll to the builder.
  var isPreview = root.getAttribute('data-preview') === '1';
  if (isPreview) {
    var y = parseInt(root.getAttribute('data-scroll') || '0', 10);
    if (y > 0) window.scrollTo(0, y);
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        try { window.parent.postMessage({ source: 'ph-preview', type: 'scroll', y: window.scrollY }, '*'); } catch (e) { /* ignore */ }
      });
    }, { passive: true });
  }

  var fades = document.querySelectorAll('.fade-in');
  if (isPreview) {
    fades.forEach(function (el) { el.classList.add('visible'); el.style.transition = 'none'; });
    fades = [];
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1 });
    fades.forEach(function (el) { io.observe(el); });
  } else {
    fades.forEach(function (el) { el.classList.add('visible'); });
  }


/* ------------------------------------------------------------------------------------------------
 * Contact form (shared by every template; the three form markups all use #contactForm / #sendBtn / #formMsg)
 *
 * Submitting sends a REAL email through the site's /api/contact endpoint. This sandboxed document has an
 * opaque origin, so it hands the message to its parent page (js/contact-relay.js), which performs the
 * same-origin request. Success is shown only when the server reports that the email provider accepted the
 * message. Gmail Compose is kept as an optional fallback link shown when delivery fails.
 * ---------------------------------------------------------------------------------------------- */
var form = document.getElementById('contactForm');

if (form) {
  var msgBox = document.getElementById('formMsg');
  var sendBtn = document.getElementById('sendBtn') || form.querySelector('button[type="submit"]');
  var idleHtml = sendBtn ? sendBtn.innerHTML : '';
  var sending = false;
  var isPreview = !!(document.body && document.body.getAttribute('data-preview') === '1');
  var EMAIL_RE = /^[^\s@<>"',;:\\()\[\]]{1,64}@[^\s@<>"',;:\\()\[\]]+\.[A-Za-z]{2,}$/;
  var TEXT = {
    success: 'Message sent successfully.',
    failure: 'Failed to send message. Please try again.',
    rate: 'Too many messages in a short time. Please wait a few minutes and try again.',
    preview: 'The contact form is disabled in the builder preview. Visitors can send messages from your published portfolio.'
  };

  // Honeypot for bots: invisible to people and assistive tech, never filled by them.
  (function () {
    var trap = document.createElement('input');
    trap.type = 'text'; trap.name = 'website'; trap.tabIndex = -1; trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;';
    form.appendChild(trap);
  })();

  var show = function (ok, text, extra) {
    if (!msgBox) return;
    msgBox.hidden = false;
    msgBox.className = 'form-msg ' + (ok ? 'ok' : 'err');
    msgBox.setAttribute('role', ok ? 'status' : 'alert');
    while (msgBox.firstChild) msgBox.removeChild(msgBox.firstChild);
    msgBox.appendChild(document.createTextNode(text));
    if (extra) { msgBox.appendChild(document.createTextNode(' ')); msgBox.appendChild(extra); }
  };

  var field = function (n) { return form.elements[n]; };
  var clearInvalid = function () {
    Array.prototype.forEach.call(form.elements, function (el) { if (el.removeAttribute) el.removeAttribute('aria-invalid'); });
  };
  var invalid = function (n, text) {
    var el = field(n);
    if (el) { el.setAttribute('aria-invalid', 'true'); if (el.focus) el.focus(); }
    show(false, text);
  };
  form.addEventListener('input', function (e) { if (e.target && e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });

  var setLoading = function (on) {
    sending = on;
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    if (!sendBtn) return;
    sendBtn.disabled = on;
    sendBtn.style.opacity = on ? '0.7' : '';
    sendBtn.style.cursor = on ? 'progress' : '';
    if (on) sendBtn.textContent = 'Sending...'; else sendBtn.innerHTML = idleHtml;
  };

  // Optional fallback that keeps Gmail Compose available when delivery fails.
  var gmailLink = function (v) {
    var to = (form.getAttribute('data-email') || '').trim();
    if (!EMAIL_RE.test(to)) return null;
    var a = document.createElement('a');
    a.href = 'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(to) +
      '&su=' + encodeURIComponent('Portfolio Contact: ' + v.name + (v.subject ? ' - ' + v.subject : '')) +
      '&body=' + encodeURIComponent(['Name: ' + v.name, 'Visitor email: ' + v.email, '', 'Message:', v.message].join('\n'));
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Write it in Gmail instead';
    a.style.cssText = 'color:inherit;text-decoration:underline;';
    return a;
  };

  // Hand the message to the parent page, which delivers it. Resolves with { ok, code, message, fields }.
  var relay = function (payload) {
    return new Promise(function (resolve) {
      if (isPreview) { resolve({ ok: false, code: 'preview' }); return; }
      if (window.parent === window) { resolve({ ok: false, code: 'unavailable' }); return; }
      var id = Date.now() + '-' + Math.random().toString(36).slice(2);
      var timer = setTimeout(function () { done({ ok: false, code: 'network' }); }, 25000);
      var onMsg = function (e) {
        var d = e.data;
        if (e.source !== window.parent || !d || d.source !== 'ph-contact' || d.type !== 'result' || d.id !== id) return;
        done(d);
      };
      var done = function (result) { clearTimeout(timer); window.removeEventListener('message', onMsg); resolve(result); };
      window.addEventListener('message', onMsg);
      try { window.parent.postMessage({ source: 'ph-contact', type: 'submit', id: id, payload: payload }, '*'); }
      catch (err) { done({ ok: false, code: 'unavailable' }); }
    });
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;                       // duplicate submissions are ignored while a request is running

    var v = {
      name: field('name').value.trim(),
      email: field('email').value.trim(),
      subject: field('subject') ? field('subject').value.trim() : '',
      message: field('message').value.trim(),
      website: field('website') ? field('website').value : ''
    };

    clearInvalid();
    if (!v.name) return invalid('name', 'Please enter your name.');
    if (v.name.length > 100) return invalid('name', 'Your name must be at most 100 characters.');
    if (!v.email) return invalid('email', 'Please enter your email address.');
    if (v.email.length > 254 || !EMAIL_RE.test(v.email)) return invalid('email', 'Please enter a valid email address.');
    if (v.subject.length > 150) return invalid('subject', 'The subject must be at most 150 characters.');
    if (!v.message) return invalid('message', 'Please write a message.');
    if (v.message.length > 5000) return invalid('message', 'Your message must be at most 5000 characters.');

    setLoading(true);
    if (msgBox) { msgBox.hidden = true; }

    relay(v).then(function (res) {
      setLoading(false);
      if (res && res.ok === true) {
        show(true, TEXT.success);
        form.reset();                          // cleared ONLY after confirmed delivery
        return;
      }
      // Failure: the visitor's input stays in the form so nothing has to be retyped.
      var code = res && res.code;
      if (code === 'preview') { show(false, TEXT.preview); return; }
      if (code === 'validation') {
        var first = res.fields ? Object.keys(res.fields)[0] : null;
        if (first) { invalid(first, res.fields[first]); return; }
        show(false, res.message || TEXT.failure); return;
      }
      if (code === 'rate_limited') { show(false, TEXT.rate, gmailLink(v)); return; }
      show(false, TEXT.failure, gmailLink(v));
    });
  });
}
})();
