/**
 * explore.js — Explore Portfolios module (Fixed)
 */

import supabase from './supabase-client.js';
import { sanitize } from './utils.js';

let currentPage = 0;
const PAGE_SIZE = 12;
let currentSearch = '';
let currentRole   = 'all';
let currentSort   = 'newest';

export async function init() {
  bindSearchHandlers();
  bindRoleFilters();
  bindSortHandler();
  await loadPortfolios(true);
}

function bindSearchHandlers() {
  const searchInput = document.getElementById('explore-search');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim();
    loadPortfolios(true);
  });
}

function bindRoleFilters() {
  document.querySelectorAll('#role-pills .role-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('#role-pills .role-pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      currentRole = e.target.dataset.role;
      loadPortfolios(true);
    });
  });
}

function bindSortHandler() {
  const sortSelect = document.getElementById('sort-select');
  sortSelect?.addEventListener('change', () => {
    currentSort = sortSelect.value;
    loadPortfolios(true);
  });
}

async function loadPortfolios(reset = false) {
  if (reset) currentPage = 0;
  const grid = document.getElementById('portfolio-grid');
  const skeleton = document.getElementById('portfolio-skeleton');
  if (skeleton && reset) skeleton.style.display = 'grid';
  if (grid && reset) grid.innerHTML = '';

  try {
    let query = supabase
      .from('portfolios')
      .select(`
        id,
        template_id,
        slug,
        is_published,
        created_at,
        profiles (
          id,
          full_name,
          title,
          avatar_url,
          username,
          bio,
          role
        )
      `)
      .eq('is_published', true)
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    const { data: portfolios, error } = await query;
    if (error) throw error;

    if (skeleton) skeleton.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    let filtered = (portfolios || []).filter(p => {
      const profile = p.profiles || {};
      const name  = (profile.full_name || '').toLowerCase();
      const title = (profile.title || '').toLowerCase();
      const role  = (profile.role || '').toLowerCase();

      const searchMatch = !currentSearch ||
        name.includes(currentSearch.toLowerCase()) ||
        title.includes(currentSearch.toLowerCase());

      const roleMatch = currentRole === 'all' ||
        role.includes(currentRole.toLowerCase()) ||
        title.includes(currentRole.toLowerCase());

      return searchMatch && roleMatch;
    });

    filtered.forEach(portfolio => {
      const card = renderPortfolioCard(portfolio, portfolio.profiles || {});
      if (card && grid) grid.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading portfolios:', err);
    if (skeleton) skeleton.style.display = 'none';
  }
}

function renderPortfolioCard(portfolio, profile) {
  const name    = sanitize(profile.full_name || 'Anonymous');
  const title   = sanitize(profile.title || 'Professional');
  const slug    = sanitize(portfolio.slug || '');
  const avatarUrl = profile.avatar_url || '';
  const portfolioUrl = slug ? `public-portfolio.html?u=${slug}` : '#';

  const card = document.createElement('article');
  card.className = 'portfolio-card';
  card.innerHTML = `
    <a href="${portfolioUrl}" class="portfolio-card-cover-link" target="_blank" rel="noopener">
      <div class="portfolio-card-cover" style="background:linear-gradient(135deg, #2563EB 0%, #1E3A8A 100%);"></div>
    </a>
    <div class="portfolio-card-body">
      <h3 class="portfolio-card-name"><a href="${portfolioUrl}" target="_blank" rel="noopener">${name}</a></h3>
      <p class="portfolio-card-title">${title}</p>
      <a href="${portfolioUrl}" class="btn btn-sm btn-primary portfolio-view-btn" target="_blank" rel="noopener">View Portfolio</a>
    </div>
  `;
  return card;
}