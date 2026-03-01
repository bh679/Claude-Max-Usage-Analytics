const express = require('express');
const { insertSnapshot, getLatestSnapshot, getSnapshots } = require('../db');

const router = express.Router();

// POST /api/scrape — receives JSON from scraper, validates, stores in SQLite
router.post('/', (req, res) => {
  const data = req.body;

  if (!data || !data.timestamp) {
    return res.status(400).json({ error: 'Invalid payload: missing timestamp' });
  }

  try {
    const id = insertSnapshot(data);
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

module.exports = router;
