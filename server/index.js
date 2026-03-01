require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const scrapeRoutes = require('./routes/scrape');

const PORT = process.env.PORT || 8080;

// Initialize database
initDb();

const app = express();

app.use(cors());
app.use(express.json());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/scrape', scrapeRoutes);

app.listen(PORT, () => {
  console.log(`Claude Max Usage Analytics running on http://localhost:${PORT}`);
});
