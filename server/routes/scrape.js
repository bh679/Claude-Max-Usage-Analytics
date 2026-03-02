const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AUTH_FILE = path.join(__dirname, '..', '..', 'capture', '.auth-state.json');
const AUTH_EXPIRY_DAYS = parseInt(process.env.AUTH_EXPIRY_DAYS || '30', 10);
const {
  insertSnapshot, getLatestSnapshot, getSnapshots,
  insertScrapeLog, getRecentScrapeLog, getScheduleInfo,
} = require('../db');

const router = express.Router();

// Track in-progress trigger to prevent concurrent scrapes
let isScraping = false;

// POST /api/scrape — receives JSON from scraper, validates, stores in SQLite
router.post('/', (req, res) => {
  const data = req.body;

  if (!data || !data.timestamp) {
    return res.status(400).json({ error: 'Invalid payload: missing timestamp' });
  }

  try {
    const id = insertSnapshot(data);
    // Log success if duration was included by the scraper
    if (data.scrape_duration_ms != null) {
      insertScrapeLog({ status: 'success', duration_ms: data.scrape_duration_ms });
    }
    res.json({ id, message: 'Snapshot stored' });
  } catch (err) {
    console.error('Failed to store snapshot:', err.message);
    res.status(500).json({ error: 'Failed to store snapshot' });
  }
});

// GET /api/scrape/latest — returns most recent snapshot
router.get('/latest', (req, res) => {
  const snapshot = getLatestSnapshot();
  if (!snapshot) {
    return res.json({ data: null, message: 'No snapshots yet' });
  }
  res.json(snapshot);
});

// GET /api/scrape/history?from=&to=&limit= — paginated history
router.get('/history', (req, res) => {
  const { from, to, limit } = req.query;
  const snapshots = getSnapshots({
    from: from || undefined,
    to: to || undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  res.json(snapshots);
});

// POST /api/scrape/trigger — spawn scraper as child process
router.post('/trigger', (req, res) => {
  if (isScraping) {
    return res.status(409).json({ error: 'Scrape already in progress' });
  }

  isScraping = true;
  const startedAt = Date.now();
  const scraperPath = path.join(__dirname, '..', '..', 'capture', 'scrape-usage.js');

  const child = spawn(process.execPath, [scraperPath, '--post'], {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  child.on('close', code => {
    const duration_ms = Date.now() - startedAt;
    isScraping = false;

    let status;
    if (stderr.includes('AUTH_REQUIRED')) {
      status = 'auth-needed';
    } else if (code === 0) {
      status = 'success';
    } else {
      status = 'fail';
    }

    // Only log here if scraper didn't POST (i.e. failed before posting)
    // On success the POST /api/scrape handler already logged it
    if (status !== 'success') {
      insertScrapeLog({ status, duration_ms, error_msg: stderr.slice(0, 500) || null });
    }

    res.json({ status, duration_ms });
  });

  child.on('error', err => {
    isScraping = false;
    const duration_ms = Date.now() - startedAt;
    insertScrapeLog({ status: 'fail', duration_ms, error_msg: err.message });
    res.status(500).json({ status: 'fail', error: err.message });
  });
});

// GET /api/scrape/status — auth status, last scraped, next scheduled
router.get('/status', (req, res) => {
  const latest = getLatestSnapshot();
  const recentLog = getRecentScrapeLog(1);
  const { intervalHours } = getScheduleInfo();

  const lastEntry = recentLog[0] || null;

  let authStatus = 'unknown';
  if (lastEntry) {
    if (lastEntry.status === 'auth-needed') {
      authStatus = 'expired';
    } else if (lastEntry.status === 'success') {
      const ageMs = Date.now() - new Date(lastEntry.completed_at + 'Z').getTime();
      authStatus = ageMs > 12 * 60 * 60 * 1000 ? 'aging' : 'ok';
    } else {
      authStatus = 'unknown';
    }
  }

  const lastScraped = latest ? latest.scraped_at : null;
  let nextScheduledAt = null;
  if (lastScraped) {
    const lastMs = new Date(lastScraped + 'Z').getTime();
    nextScheduledAt = new Date(lastMs + intervalHours * 60 * 60 * 1000).toISOString();
  }

  // Auth file age + estimated expiry
  let authFileLastRefreshed = null;
  let authFileExpiresAt = null;
  try {
    const stat = fs.statSync(AUTH_FILE);
    authFileLastRefreshed = stat.mtime.toISOString();
    authFileExpiresAt = new Date(stat.mtimeMs + AUTH_EXPIRY_DAYS * 86400000).toISOString();
  } catch (_) {
    // Auth file doesn't exist — leave null
  }

  res.json({
    lastScraped,
    authStatus,
    nextScheduledAt,
    isScraping,
    intervalHours,
    authFileLastRefreshed,
    authFileExpiresAt,
  });
});

// GET /api/scrape/log?limit=20 — recent scrape log entries
router.get('/log', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
  res.json(getRecentScrapeLog(limit));
});

module.exports = router;
