const express = require('express');
const { getOtelMetrics, getOtelEvents, getOtelSummary } = require('../db');

const router = express.Router();

// GET /api/otel/summary?since=ISO_DATE
router.get('/summary', (req, res) => {
  const { since } = req.query;
  try {
    const summary = getOtelSummary({ since: since || undefined });
    res.json(summary);
  } catch (err) {
    console.error('Failed to get OTel summary:', err.message);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

// GET /api/otel/metrics?metric_name=&since=&session_id=&limit=
router.get('/metrics', (req, res) => {
  const { metric_name, since, session_id, limit } = req.query;
  try {
    const metrics = getOtelMetrics({
      metric_name: metric_name || undefined,
      since: since || undefined,
      session_id: session_id || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    res.json(metrics);
  } catch (err) {
    console.error('Failed to get OTel metrics:', err.message);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// GET /api/otel/events?event_name=&since=&session_id=&limit=
router.get('/events', (req, res) => {
  const { event_name, since, session_id, limit } = req.query;
  try {
    const events = getOtelEvents({
      event_name: event_name || undefined,
      since: since || undefined,
      session_id: session_id || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    res.json(events);
  } catch (err) {
    console.error('Failed to get OTel events:', err.message);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

module.exports = router;
