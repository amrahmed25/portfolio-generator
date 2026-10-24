/**
 * navigation.js
 * PortfolioHub — Navigation Module (Fixed)
 */

import supabase from './supabase-client.js';

function getNavbarHTML() {
  return `
    <nav class="navbar" id="navbar">
      <div class="nav-container">
        <a href="index.html" class="nav-logo">
          <span class="nav-logo-icon">🚀</span>
          <span class="nav-logo-text">PortfolioHub</span>
        </a>

        <ul class="nav-links" id="nav-links">
          <li><a href="index.html" class="nav-link" data-page="index">Home</a></li>
          <li><a href="explore.html" class="nav-link" data-page="explore">Explore</a></li>
          <li><a href="templates.html" class="nav-link" data-page="templates">Templates</a></li>
          <li><a href="community.html" class="nav-link" data-page="community">Community</a></li>
        </ul>

        <div class="nav-auth" id="nav-auth">
          <div class="nav-auth-guest" id="nav-auth-guest">
            <a href="login.html" class="btn btn-ghost nav-btn-login">Login</a>
            <a href="signup.html" class="btn btn-primary nav-btn-signup">Get Started</a>
          </div>

          <div class="nav-auth-user" id="nav-auth-user" style="display:none;">
            <a href="dashboard.html" class="btn btn-ghost nav-dashboard-link">Dashboard</a>
            <div class="nav-user-dropdown" id="nav-user-dropdown">
              <button class="nav-avatar-btn" id="nav-avatar-btn" aria-haspopup="true" aria-expanded="false">
                <img src="" alt="User Avatar" class="nav-avatar-img" id="nav-avatar-img" />
                <span class="nav-avatar-initials" id="nav-avatar-initials"></span>
                <svg class="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="nav-dropdown-menu" id="nav-dropdown-menu" role="menu">
                <div class="nav-dropdown-header">
                  <span class="nav-dropdown-name" id="nav-dropdown-name">User</span>
                  <span class="nav-dropdown-email" id="nav-dropdown-email"></span>
                </div>
                <div class="nav-dropdown-divider"></div>
                <a href="dashboard.html" class="nav-dropdown-item" role="menuitem">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  Dashboard
                </a>
                <a href="dashboard.html" class="nav-dropdown-item" role="menuitem">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Profile Settings
                </a>
                <a href="dashboard.html" class="nav-dropdown-item" role="menuitem">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  My Portfolios
                </a>
                <div class="nav-dropdown-divider"></div>
                <button class="nav-dropdown-item nav-dropdown-logout" id="nav-logout-btn" role="menuitem">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>

        <button class="nav-hamburger" id="nav-hamburger" aria-label="Toggle menu" aria-expanded="false">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
      </div>

      <div class="nav-mobile-menu" id="nav-mobile-menu" aria-hidden="true">
        <ul class="nav-mobile-links">
          <li><a href="index.html" class="nav-mobile-link" data-page="index">Home</a></li>
          <li><a href="explore.html" class="nav-mobile-link" data-page="explore">Explore</a></li>
          <li><a href="templates.html" class="nav-mobile-link" data-page="templates">Templates</a></li>
          <li><a href="community.html" class="nav-mobile-link" data-page="community">Community</a></li>
        </ul>
        <div class="nav-mobile-auth" id="nav-mobile-auth">
          <div class="nav-mobile-auth-guest" id="nav-mobile-auth-guest">
            <a href="login.html" class="btn btn-ghost nav-mobile-btn">Login</a>
            <a href="signup.html" class="btn btn-primary nav-mobile-btn">Get Started</a>
          </div>
          <div class="nav-mobile-auth-user" id="nav-mobile-auth-user" style="display:none;">
            <a href="dashboard.html" class="nav-mobile-link">Dashboard</a>
            <button class="nav-mobile-link nav-mobile-logout" id="nav-mobile-logout-btn">Logout</button>
          </div>
        </div>
      </div>
    </nav>
    <div class="nav-overlay" id="nav-overlay"></div>
  `;
}

export function renderNavbar(containerId = 'main-nav') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = getNavbarHTML();
}

export async function initNavigation() {
  renderNavbar('navbar-placeholder');
  const path = window.location.pathname;
  const filename = path.substring(path.lastIndexOf('/') + 1).replace('.html', '') || 'index';

  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === filename);
  });

  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('nav-mobile-menu');
  const overlay = document.getElementById('nav-overlay');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.contains('open');
      mobileMenu.classList.toggle('open', !isOpen);
      hamburger.classList.toggle('open', !isOpen);
      if (overlay) overlay.classList.toggle('active', !isOpen);
    });
  }

  const { data: { session } } = await supabase.auth.getSession();
  const guestEl = document.getElementById('nav-auth-guest');
  const userEl = document.getElementById('nav-auth-user');
  if (session) {
    if (guestEl) guestEl.style.display = 'none';
    if (userEl) userEl.style.display = 'flex';
  }
}