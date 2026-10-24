/**
 * PortfolioHub — Supabase Client Module (Optimized & Non-Blocking)
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.PORTFOLIOHUB_CONFIG;

if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseUrl.startsWith('YOUR_')) {
  throw new Error(
    '[PortfolioHub] Supabase is not configured. Load js/config.js before any module.'
  );
}
const { supabaseUrl, supabaseAnonKey } = cfg;

/** Shared Supabase client instance with WebSockets disabled to prevent hanging */
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 0
    }
  }
});

export default supabase;

export async function signOut(redirectTo = '/index.html') {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[PortfolioHub] signOut failed:', error);
  window.location.href = redirectTo;
}

export async function getUser() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return data.session.user;
  } catch (err) {
    console.error('[PortfolioHub] getUser error:', err);
    return null;
  }
}

export async function requireAuth(redirectPath = 'login.html') {
  const user = await getUser();
  if (!user) {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${redirectPath}?next=${returnTo}`;
    return new Promise(() => {});
  }
  return user;
}