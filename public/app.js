// ── Relative time helper ──────────────────────────────────────────────────────
function relativeTime(isoString) {
  if (!isoString) return '—';
  const diffMs = Date.now() - new Date(isoString + (isoString.endsWith('Z') ? '' : 'Z')).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + ' min ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' hr ago';
  return Math.floor(diffSec / 86400) + ' days ago';
}

function countdown(isoString) {
  if (!isoString) return '—';
  const diffMs = new Date(isoString + (isoString.endsWith('Z') ? '' : 'Z')).getTime() - Date.now();
  if (diffMs <= 0) return 'now';
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h > 0) return `in ${h} hr ${m} min`;
  return `in ${m} min`;
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function formatAbsolute(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString + (isoString.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Auth status display ───────────────────────────────────────────────────────
function updateAuthUI(status) {
  const dot = document.getElementById('auth-status-dot');
  const text = document.getElementById('auth-status-text');
  const link = document.getElementById('auth-reauth-link');
  const refreshEl = document.getElementById('auth-refresh-time');
  const expiryEl = document.getElementById('auth-expiry-time');

  dot.className = 'auth-dot';
  link.classList.add('hidden');

  const authStatus = typeof status === 'string' ? status : status.authStatus;

  if (authStatus === 'ok') {
    dot.classList.add('auth-ok');
    text.textContent = 'Auth OK';
  } else if (authStatus === 'aging') {
    dot.classList.add('auth-aging');
    text.textContent = 'Auth aging (>12h)';
  } else if (authStatus === 'expired') {
    dot.classList.add('auth-expired');
    text.textContent = 'Auth expired';
    link.classList.remove('hidden');
  } else {
    dot.classList.add('auth-unknown');
    text.textContent = 'No scrapes yet';
  }

  // Auth file age + expiry
  if (status && typeof status === 'object') {
    if (status.authFileLastRefreshed) {
      refreshEl.textContent = 'Refreshed ' + relativeTime(status.authFileLastRefreshed);
    } else {
      refreshEl.textContent = '';
    }

    if (status.authFileExpiresAt) {
      const msUntilExpiry = new Date(status.authFileExpiresAt).getTime() - Date.now();
      const daysLeft = Math.ceil(msUntilExpiry / 86400000);
      const expiryDate = new Date(status.authFileExpiresAt)
        .toLocaleDateString([], { month: 'short', day: 'numeric' });

      if (daysLeft <= 0) {
        expiryEl.textContent = 'Expires today';
        expiryEl.className = 'auth-expiry-time auth-expiry-urgent';
      } else if (daysLeft <= 3) {
        expiryEl.textContent = `Expires ~${expiryDate} (${daysLeft}d)`;
        expiryEl.className = 'auth-expiry-time auth-expiry-soon';
      } else {
        expiryEl.textContent = `Expires ~${expiryDate}`;
        expiryEl.className = 'auth-expiry-time';
      }
    } else {
      expiryEl.textContent = '';
    }
  }
}

// ── Status bar polling ────────────────────────────────────────────────────────
async function loadStatus() {
  try {
    const res = await fetch('/api/scrape/status');
    const status = await res.json();

    updateAuthUI(status);

    document.getElementById('last-scraped-relative').textContent =
      relativeTime(status.lastScraped);
    document.getElementById('last-scraped-absolute').textContent =
      status.lastScraped ? formatAbsolute(status.lastScraped) : '';

    document.getElementById('next-scrape-countdown').textContent =
      countdown(status.nextScheduledAt);
  } catch (err) {
    console.error('Failed to load status:', err);
  }
}

// ── Scrape log rendering ──────────────────────────────────────────────────────
async function loadScrapeLog() {
  try {
    const res = await fetch('/api/scrape/log?limit=20');
    const entries = await res.json();
    const tbody = document.getElementById('scrape-log-tbody');

    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="log-empty">No scrape history yet.</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(e => {
      let statusCell;
      if (e.status === 'success') {
        statusCell = '<td class="status-success">✓ success</td>';
      } else if (e.status === 'auth-needed') {
        statusCell = '<td class="status-auth-needed">✗ auth needed</td>';
      } else {
        statusCell = '<td class="status-fail">✗ fail</td>';
      }
      const ts = new Date(e.started_at + (e.started_at.endsWith('Z') ? '' : 'Z'));
      return `<tr>
        <td>${ts.toLocaleString()}</td>
        ${statusCell}
        <td>${formatDuration(e.duration_ms)}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load scrape log:', err);
  }
}

// ── Scrape Now button ─────────────────────────────────────────────────────────
async function scrapeNow() {
  const btn = document.getElementById('scrape-now-btn');
  const spinner = document.getElementById('scrape-spinner');

  btn.disabled = true;
  spinner.classList.remove('hidden');

  try {
    const res = await fetch('/api/scrape/trigger', { method: 'POST' });
    const result = await res.json();
    if (!res.ok) {
      console.error('Trigger failed:', result.error);
    }
  } catch (err) {
    console.error('Trigger request failed:', err);
  }

  btn.disabled = false;
  spinner.classList.add('hidden');

  // Reload all data after scrape
  await Promise.all([loadData(), loadStatus(), loadScrapeLog()]);
}

// ── Main usage data load ──────────────────────────────────────────────────────
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

// ── Init ──────────────────────────────────────────────────────────────────────
loadData();
loadStatus();
loadScrapeLog();

// Auto-refresh usage data every 5 minutes
setInterval(loadData, 5 * 60 * 1000);
// Refresh status bar every 30 seconds
setInterval(() => { loadStatus(); loadScrapeLog(); }, 30 * 1000);
// Update relative time / countdown every minute
setInterval(() => {
  loadStatus();
}, 60 * 1000);
