async function loadData() {
  try {
    const res = await fetch('/api/scrape/latest');
    const snapshot = await res.json();

    if (!snapshot || snapshot.data === null) {
      document.getElementById('no-data').classList.remove('hidden');
      document.getElementById('dashboard').classList.add('hidden');
      return;
    }

    document.getElementById('no-data').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    // Plan usage meters
    const sessionPercent = snapshot.session_exact_percent ?? snapshot.session_percent ?? 0;
    const allModelsPercent = snapshot.all_models_exact_percent ?? snapshot.all_models_percent ?? 0;
    const sonnetPercent = snapshot.sonnet_exact_percent ?? snapshot.sonnet_percent ?? 0;

    document.getElementById('session-bar').style.width = sessionPercent + '%';
    document.getElementById('session-percent').textContent = Math.round(sessionPercent) + '% used';
    document.getElementById('session-reset').textContent = snapshot.session_reset_in
      ? 'Resets in ' + snapshot.session_reset_in
      : '';

    document.getElementById('all-models-bar').style.width = allModelsPercent + '%';
    document.getElementById('all-models-percent').textContent = Math.round(allModelsPercent) + '% used';
    document.getElementById('all-models-reset').textContent = snapshot.all_models_resets_at
      ? 'Resets ' + snapshot.all_models_resets_at
      : '';

    document.getElementById('sonnet-bar').style.width = sonnetPercent + '%';
    document.getElementById('sonnet-percent').textContent = Math.round(sonnetPercent) + '% used';
    document.getElementById('sonnet-reset').textContent = snapshot.sonnet_resets_at
      ? 'Resets ' + snapshot.sonnet_resets_at
      : '';

    // Last updated
    document.getElementById('last-updated').textContent = snapshot.last_updated
      ? 'Last updated: ' + snapshot.last_updated
      : '';

    // Extra usage section
    const extraSection = document.getElementById('extra-usage-section');
    if (snapshot.amount_spent || snapshot.spend_limit) {
      extraSection.classList.remove('hidden');
      document.getElementById('amount-spent').textContent = snapshot.amount_spent || '—';
      document.getElementById('spend-limit').textContent = snapshot.spend_limit || '—';

      const spendPercent = snapshot.spend_percent ?? 0;
      document.getElementById('spend-bar').style.width = spendPercent + '%';

      document.getElementById('current-balance').textContent = snapshot.current_balance || '—';
      document.getElementById('auto-reload').textContent = snapshot.auto_reload ? 'On' : 'Off';
      document.getElementById('extra-reset-date').textContent = snapshot.extra_reset_date || '—';
    } else {
      extraSection.classList.add('hidden');
    }

    // Account info
    document.getElementById('plan-name').textContent = formatPlanName(snapshot.plan);
    document.getElementById('country').textContent = snapshot.country || '—';

    // Snapshot timestamp
    const scrapedAt = new Date(snapshot.scraped_at);
    document.getElementById('scraped-at').textContent = 'Snapshot captured: ' + scrapedAt.toLocaleString();
  } catch (err) {
    console.error('Failed to load usage data:', err);
  }
}

function formatPlanName(plan) {
  if (!plan) return '—';
  return plan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Load on page open
loadData();

// Auto-refresh every 5 minutes
setInterval(loadData, 5 * 60 * 1000);
