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


var form = document.getElementById('contactForm');

if (form) {
  var msgBox = document.getElementById('formMsg');

  var show = function (ok, text) {
    if (!msgBox) return;

    msgBox.hidden = false;
    msgBox.className = 'form-msg ' + (ok ? 'ok' : 'err');
    msgBox.textContent = text;
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = form.elements.name.value.trim();
    var email = form.elements.email.value.trim();
    var subject = form.elements.subject.value.trim();
    var message = form.elements.message.value.trim();

    var to = (
      form.getAttribute('data-email') ||
      ''
    ).trim();

    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !message) {
      show(false, 'Please fill in your name, email and message.');
      return;
    }

    if (!emailPattern.test(email)) {
      show(false, 'Please enter a valid email address.');
      return;
    }

    if (!emailPattern.test(to)) {
      show(false, 'The portfolio owner has not configured a valid email address.');
      return;
    }

    var emailSubject =
      'Portfolio Contact: ' + name +
      (subject ? ' - ' + subject : '');

    var body = [
      'Name: ' + name,
      'Visitor email: ' + email,
      '',
      'Message:',
      message
    ].join('\n');

    var gmailUrl =
        'https://mail.google.com/mail/?view=cm&fs=1' +
        '&to=' + encodeURIComponent(to) +
        '&su=' + encodeURIComponent(emailSubject) +
        '&body=' + encodeURIComponent(body);

    // Gmail Compose always opens in a NEW top-level tab; it is never loaded inside this frame
    // (Gmail forbids framing). Do not pass "noopener" in the features string: it makes
    // window.open() return null even when the tab opened, which falsely reports "blocked".
    var gmailWindow = window.open(gmailUrl, '_blank');

    if (gmailWindow) {
      try { gmailWindow.opener = null; } catch (err) { /* cross-origin: nothing to detach */ }
      show(
        true,
        'Gmail compose opened with your message. Please review it and click Send in Gmail.'
      );
    } else {
      show(
        false,
        'Your browser blocked the Gmail window. Allow pop-ups for this site and try again, or email ' + to + ' directly.'
      );
    }
  });
}
})();
