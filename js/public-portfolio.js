/**
 * public-portfolio.js
 * Public page for a published portfolio. Resolves /u/{user_handle}/{number} (owner handle +
 * per-user portfolio number), still accepts legacy /u/<slug> links and canonicalises them,
 * renders with the same renderer the builder preview uses, and wires the share bar.
 * Also works as public-portfolio.html?u=<handle>&n=<number> on hosts without rewrites.
 */
import supabase from './supabase-client.js';
import { showToast, copyToClipboard } from './utils.js';
import { normalizeData, buildDocument } from './portfolio-renderer.js';
import { parseRoute, fromPublicNumber } from './portfolio-url.js';
import { publicUrl } from './portfolio-service.js';

const $ = sel => document.querySelector(sel);
const STATES = ['state-not-found', 'state-not-published', 'state-error'];

const CHILD_TABLES = {
  projects: 'portfolio_projects', services: 'portfolio_services', skills: 'portfolio_skills',
  experience: 'portfolio_experience', education: 'portfolio_education',
  certifications: 'portfolio_certifications', links: 'portfolio_links'
};

/** URL the share/copy buttons use. Starts as the current URL; becomes the canonical one after load. */
let shareUrl = window.location.href;

function showState(id) {
  $('#portfolio-container').style.display = 'none';
  STATES.forEach(s => document.getElementById(s).classList.toggle('visible', s === id));
  // Not-found / unpublished / error pages must never be indexed under a portfolio URL.
  setMeta('robots', 'noindex');
}

function hideLoading() {
  const overlay = $('#loading-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 450);
}

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function applyMeta(model, avatar) {
  document.title = `${model.seoTitle} | PortfolioHub`;
  setMeta('description', model.seoDescription || `${model.name}'s portfolio on PortfolioHub.`);
  setMeta('og:title', model.seoTitle);
  setMeta('og:description', model.seoDescription || `Explore ${model.name}'s portfolio.`);
  if (avatar) setMeta('og:image', avatar);
}

function renderFrame(model) {
  const container = $('#portfolio-container');
  container.style.display = '';
  const frame = document.createElement('iframe');
  frame.id = 'portfolio-frame';
  frame.title = `${model.name}'s portfolio`;
  // Same sandbox as the builder preview: scripts run, but cannot touch this page or its session.
  frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-top-navigation-to-custom-protocols');
  frame.srcdoc = buildDocument(model, { baseUrl: new URL('./', document.baseURI).href });
  container.replaceChildren(frame);
}

async function findPortfolio(route) {
  if (route.slug) return supabase.from('portfolios').select('*').eq('slug', route.slug).maybeSingle();

  // /u/{handle}/{number}: the number must be a valid public number, otherwise it is simply "not found".
  const portfolioNumber = fromPublicNumber(route.rawNumber);
  if (portfolioNumber === null || !route.handle) return { data: null, error: null };

  // Resolve the owner through the public profiles table, then the portfolio by (owner, number),
  // so two users can both have a portfolio "1" and a user with several always gets the right one.
  const { data: owner, error } = await supabase.from('profiles').select('id').eq('user_handle', route.handle).maybeSingle();
  if (error) return { data: null, error };
  if (!owner) return { data: null, error: null };
  return supabase.from('portfolios').select('*').eq('user_id', owner.id).eq('portfolio_number', portfolioNumber).maybeSingle();
}

/**
 * Makes the address bar (and the share/copy buttons) show the canonical /u/{handle}/{number}
 * URL, whichever URL the visitor arrived on (legacy slug, upper-case handle, ...).
 * history.replaceState = a redirect without a second page load, so nothing flashes or reloads.
 */
function canonicalize(portfolio, profile) {
  if (!profile || !profile.user_handle) return;
  const canonical = publicUrl({ user_handle: profile.user_handle, portfolio_number: portfolio.portfolio_number });
  shareUrl = canonical;
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
  link.href = canonical;
  setMeta('og:url', canonical);
  if (canonical !== window.location.href) {
    try { window.history.replaceState(window.history.state, '', canonical); } catch (_) { /* e.g. file:// */ }
  }
}

async function loadPortfolio(route) {
  try {
    const { data: portfolio, error } = await findPortfolio(route);
    if (error) throw error;
    // Missing, deleted, or not visible to this visitor (RLS hides unpublished rows from everyone but the owner).
    if (!portfolio) { hideLoading(); showState('state-not-found'); return; }
    if (!portfolio.is_published) { hideLoading(); showState('state-not-published'); return; }

    const keys = Object.keys(CHILD_TABLES);
    const [profileRes, ...childRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', portfolio.user_id).maybeSingle(),
      ...keys.map(k => {
        let q = supabase.from(CHILD_TABLES[k]).select('*').eq('portfolio_id', portfolio.id);
        if (k === 'links') q = q.eq('is_hidden', false);
        return q.order('order_index', { ascending: true });
      })
    ]);
    if (profileRes.error) throw profileRes.error;
    childRes.forEach(r => { if (r.error) throw r.error; });

    const raw = { portfolio, profile: profileRes.data || {} };
    keys.forEach((k, i) => { raw[k] = childRes[i].data || []; });
    const model = normalizeData(raw);

    renderFrame(model);
    applyMeta(model, model.avatar);
    canonicalize(portfolio, profileRes.data);
    hideLoading();

    // Count the view; a failure here must never affect the page.
    try { await supabase.rpc('increment_view_count', { portfolio_slug: portfolio.slug }); } catch (_) { /* ignore */ }
  } catch (err) {
    console.error('[PortfolioHub] Failed to load portfolio:', err);
    hideLoading();
    showState('state-error');
  }
}

function initShare() {
  // shareUrl is read at click time so it reflects the canonical URL once the portfolio has loaded.
  $('#btn-copy-link').addEventListener('click', async () => {
    const ok = await copyToClipboard(shareUrl);
    showToast(ok ? 'Link copied to clipboard.' : 'Could not copy the link.', ok ? 'success' : 'error');
  });
  if (navigator.share) {
    const btn = $('#btn-native-share');
    btn.style.display = 'inline-flex';
    btn.addEventListener('click', async () => {
      try { await navigator.share({ title: document.title, url: shareUrl }); }
      catch (e) { if (e.name !== 'AbortError') showToast('Could not share.', 'error'); }
    });
  }
}

function init() {
  initShare();
  const route = parseRoute(window.location.pathname, window.location.search);
  if (!route) {
    document.title = 'Portfolio Not Found | PortfolioHub';
    hideLoading();
    showState('state-not-found');
    return;
  }
  $('#btn-retry').addEventListener('click', () => window.location.reload());
  loadPortfolio(route);
}

init();
