/**
 * community.js — Community page module (Fixed)
 */

import supabase from './supabase-client.js';
import { showToast, sanitize, formatRelativeDate } from './utils.js';

let currentUser = null;

export async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) currentUser = session.user;

  const createBtn = document.getElementById('create-post-btn');
  if (currentUser && createBtn) {
    createBtn.style.display = 'flex';
    createBtn.addEventListener('click', () => {
      document.getElementById('post-modal-overlay')?.classList.add('active');
    });
  }

  // Fix unauthenticated post redirect to use login.html instead of signin.html
  const promptBtn = document.getElementById('create-post-prompt-btn');
  if (promptBtn) {
    promptBtn.addEventListener('click', () => {
      if (!currentUser) {
        window.location.href = 'login.html';
        return;
      }
      document.getElementById('post-modal-overlay')?.classList.add('active');
    });
  }
}