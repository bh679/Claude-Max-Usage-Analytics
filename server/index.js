require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const scrapeRoutes = require('./routes/scrape');
const otelRoutes = require('./routes/otel');
const otelApiRoutes = require('./routes/otelApi');

const PORT = process.env.PORT || 8080;

// Initialize database
initDb();

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/scrape', scrapeRoutes);

// OTLP receiver endpoints (for Claude Code)
app.use('/v1', otelRoutes);

// Dashboard API for OTel data
app.use('/api/otel', otelApiRoutes);

app.listen(PORT, () => {
  console.log(`Claude Max Usage Analytics running on http://localhost:${PORT}`);
});
