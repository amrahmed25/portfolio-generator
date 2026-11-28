/**
 * explore.js — Explore Portfolios page module for PortfolioHub
 * Loads and renders published portfolio cards with search, filter, sort (incl. most/least viewed)
 * and pagination. All of it is done by the database (see loadPortfolios).
 */

import supabase from './supabase-client.js';
import { sanitize } from './utils.js';
import { publicUrl } from './portfolio-service.js';
import { TEMPLATES, resolveTemplateId } from './portfolio-renderer.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentPage = 0;
const PAGE_SIZE = 12;
let currentSearch = '';
let currentRole   = 'all';
let currentSort   = 'newest';
let hasMore       = true;
let debounceTimer = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  bindSearchHandlers();
  bindRoleFilters();
  bindSortHandler();
  bindLoadMore();
  bindResetBtn();
  await loadPortfolios(true);
}

// ─── Search ───────────────────────────────────────────────────────────────────
function bindSearchHandlers() {
  const searchInput = document.getElementById('explore-search');
  const clearBtn    = document.getElementById('explore-search-clear');
  const searchBtn   = document.getElementById('explore-search-btn');

  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    clearBtn.style.display = searchInput.value ? 'flex' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      currentPage = 0;
      loadPortfolios(true);
    }, 400);
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      currentSearch = searchInput.value.trim();
      currentPage = 0;
      loadPortfolios(true);
    }
  });

  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    currentSearch = '';
    currentPage = 0;
    loadPortfolios(true);
  });

  searchBtn?.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    currentSearch = searchInput.value.trim();
    currentPage = 0;
    loadPortfolios(true);
  });
}

// ─── Role Filter Pills ────────────────────────────────────────────────────────
function bindRoleFilters() {
  const pills = document.querySelectorAll('#role-pills .role-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentRole = pill.dataset.role;
      currentPage = 0;
      loadPortfolios(true);
    });
  });
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
function bindSortHandler() {
  const sortSelect = document.getElementById('sort-select');
  sortSelect?.addEventListener('change', () => {
    currentSort = sortSelect.value;
    currentPage = 0;
    loadPortfolios(true);
  });
}

// ─── Load More ────────────────────────────────────────────────────────────────
function bindLoadMore() {
  const btn = document.getElementById('explore-load-more-btn');
  btn?.addEventListener('click', () => {
    if (loadingMore) return;          // one "Load more" at a time: extra clicks must not skip pages
    currentPage++;
    loadPortfolios(false);
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function bindResetBtn() {
  const btn = document.getElementById('explore-reset-btn');
  btn?.addEventListener('click', () => {
    const searchInput = document.getElementById('explore-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('explore-search-clear').style.display = 'none';
    currentSearch = '';
    currentRole = 'all';
    currentSort = 'newest';
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) sortSelect.value = 'newest';
    document.querySelectorAll('#role-pills .role-pill').forEach(p => p.classList.remove('active'));
    const allPill = document.querySelector('#role-pills .role-pill[data-role="all"]');
    if (allPill) allPill.classList.add('active');
    currentPage = 0;
    loadPortfolios(true);
  });
}

// ─── Load Portfolios ──────────────────────────────────────────────────────────
// Search, role filter, SORT and pagination all run in the database (explore_portfolios(), see
// supabase_explore_sorting.sql), one page at a time. Sorting by view_count therefore ranks EVERY published
// portfolio, not just the ones already downloaded, and view_count is the unique-view counter
// maintained by record_portfolio_view().
let requestSeq = 0;            // lets a newer request supersede an older one still in flight
let loadingMore = false;       // true while a "Load more" page is being fetched
let totalCount = 0;
const renderedIds = new Set(); // a page boundary can shift when counts change between "Load more" clicks

async function fetchPage() {
  const { data, error } = await supabase.rpc('explore_portfolios', {
    p_search: currentSearch.trim(),
    p_role: currentRole,
    p_sort: currentSort,
    p_limit: PAGE_SIZE,
    p_offset: currentPage * PAGE_SIZE
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function skillNames(p) {
  return (p.portfolio_skills || [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map(s => s.name)
    .filter(Boolean);
}

async function loadPortfolios(reset = false) {
  if (reset) {
    currentPage = 0;
    hasMore = true;
    renderedIds.clear();
    loadingMore = false;
  } else {
    loadingMore = true;
  }
  const seq = ++requestSeq;

  const grid         = document.getElementById('portfolio-grid');
  const skeleton     = document.getElementById('portfolio-skeleton');
  const emptyEl      = document.getElementById('explore-empty');
  const loadMoreWrap = document.getElementById('explore-load-more-wrap');
  const loadMoreBtn  = document.getElementById('explore-load-more-btn');
  const resultsInfo  = document.getElementById('results-info');

  if (reset) {
    if (grid) { grid.replaceChildren(); grid.style.display = 'none'; }
    if (emptyEl) emptyEl.style.display = 'none';
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    if (resultsInfo) resultsInfo.style.display = 'none';
    if (skeleton) skeleton.style.display = 'grid';
  } else if (loadMoreBtn) {
    loadMoreBtn.disabled = true;     // no double clicks while the next page loads
  }

  try {
    const rows = await fetchPage();
    if (seq !== requestSeq) return;  // a newer search/sort/filter replaced this request

    if (skeleton) skeleton.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    if (rows.length) totalCount = Number(rows[0].total_count) || rows.length;
    else if (reset) totalCount = 0;

    const countEl = document.getElementById('results-count');
    if (countEl) countEl.textContent = `${totalCount} portfolio${totalCount !== 1 ? 's' : ''} found`;
    if (resultsInfo) resultsInfo.style.display = 'block';

    if (totalCount === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
      if (loadMoreWrap) loadMoreWrap.style.display = 'none';
      return;
    }

    rows.forEach(p => {
      if (renderedIds.has(p.id)) return;
      renderedIds.add(p.id);
      const card = renderPortfolioCard(p, p.profiles || {});
      if (card && grid) grid.appendChild(card);
    });

    hasMore = (currentPage + 1) * PAGE_SIZE < totalCount;
    if (loadMoreWrap) loadMoreWrap.style.display = hasMore ? 'flex' : 'none';
  } catch (err) {
    if (seq !== requestSeq) return;
    console.error('Error loading portfolios:', err);
    if (skeleton) skeleton.style.display = 'none';
    showErrorState();
  } finally {
    if (seq === requestSeq) { loadingMore = false; if (loadMoreBtn) loadMoreBtn.disabled = false; }
  }
}

// ─── Render Portfolio Card ────────────────────────────────────────────────────
function renderPortfolioCard(portfolio, profile) {
  const name    = sanitize(profile.full_name || 'Anonymous');
  const title   = sanitize(portfolio.headline || profile.title || '');
  const slug    = portfolio.slug || '';
  const bio     = sanitize(profile.bio || '');
  const role    = sanitize(profile.role || '');
  const skills  = skillNames(portfolio).slice(0, 4);
  const avatarUrl = profile.avatar_url || '';
  const template  = resolveTemplateId(portfolio.template_id);
  const templateLabel = sanitize(TEMPLATES[template].meta.name);

  const initials = getInitials(name, 2);
  const bgColor  = generateAvatarColor(name);
  const coverGrad = generateCoverGradient(name, template);

  const avatarHtml = avatarUrl
    ? `<img src="${sanitize(avatarUrl)}" alt="${name}" class="portfolio-card-avatar" loading="lazy" />`
    : `<div class="portfolio-card-avatar portfolio-card-avatar--initials" style="background:${bgColor}">${initials}</div>`;

  const skillsHtml = skills.map(s =>
    `<span class="portfolio-skill-tag">${sanitize(s)}</span>`
  ).join('');

  const bioText = bio ? truncateText(bio, 90) : '';

  const portfolioUrl = slug ? sanitize(publicUrl({ slug, portfolio_number: portfolio.portfolio_number, user_handle: profile.user_handle })) : '#';

  const card = document.createElement('article');
  card.className = 'portfolio-card';
  card.innerHTML = `
    <a href="${portfolioUrl}" class="portfolio-card-cover-link" ${slug ? 'target="_blank" rel="noopener"' : ''} aria-label="View ${name}'s portfolio">
      <div class="portfolio-card-cover" style="background:${coverGrad}">
        <div class="portfolio-card-cover-pattern"></div>
        <div class="template-badge">${templateLabel}</div>
      </div>
    </a>
    <div class="portfolio-card-body">
      <div class="portfolio-card-avatar-wrap">
        ${avatarHtml}
      </div>
      <div class="portfolio-card-info">
        <h3 class="portfolio-card-name">
          <a href="${portfolioUrl}" ${slug ? 'target="_blank" rel="noopener"' : ''}>${name}</a>
        </h3>
        <p class="portfolio-card-title">${title}</p>
        ${bioText ? `<p class="portfolio-card-bio">${bioText}</p>` : ''}
        ${skillsHtml ? `<div class="portfolio-card-skills">${skillsHtml}</div>` : ''}
        ${role ? `<span class="portfolio-card-role">${role}</span>` : ''}
      </div>
      <div class="portfolio-card-footer">
        <a href="${portfolioUrl}" class="btn btn-sm btn-primary portfolio-view-btn" ${slug ? 'target="_blank" rel="noopener"' : ''}>
          View Portfolio
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>
    </div>
  `;
  return card;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function showErrorState() {
  const grid = document.getElementById('portfolio-grid');
  if (grid) {
    grid.style.display = 'grid';
    grid.innerHTML = `
      <div class="explore-error" style="grid-column:1/-1;text-align:center;padding:3rem;">
        <p style="color:var(--secondary-text);">Failed to load portfolios. Please refresh the page.</p>
        <button class="btn btn-outline" style="margin-top:1rem;" onclick="location.reload()">Refresh</button>
      </div>
    `;
  }
}

function getInitials(name, max = 2) {
  if (!name) return '?';
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, max)
    .map(w => w[0].toUpperCase())
    .join('');
}

function generateAvatarColor(str) {
  const colors = ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2','#BE185D','#0F766E'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function generateCoverGradient(name, template) {
  const gradients = {
    reference:  'linear-gradient(135deg, #DBEAFE 0%, #93C5FD 100%)',
    developer:  'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
    creative:   'linear-gradient(135deg, #EFF6FF 0%, #BFDBFE 100%)',
    freelancer: 'linear-gradient(135deg, #F8FAFC 0%, #BAE6FD 100%)',
  };
  return gradients[template] || gradients.reference;
}

function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
}

export { init };
