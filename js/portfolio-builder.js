document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Timeout wrapper to prevent infinite hanging
    const initPromise = (async () => {
      await requireAuth();
      
      const params = new URLSearchParams(window.location.search);
      currentPortfolioId = params.get('id');

      if (!currentPortfolioId) {
        showToast('No portfolio specified. Redirecting to dashboard...', 'error');
        setTimeout(() => window.location.href = 'dashboard.html', 1500);
        return;
      }

      await loadPortfolioData();
      initBuilderUI();
      renderActiveSection();
      updateLivePreview();
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout. Please check your internet or Supabase status.')), 8000)
    );

    await Promise.race([initPromise, timeoutPromise]);

  } catch (err) {
    console.error('[Builder] Init error:', err);
    showToast(err.message || 'Failed to load portfolio builder.', 'error');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 3000);
  }
});