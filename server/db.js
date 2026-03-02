const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'usage.db');

let db;

function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      status       TEXT NOT NULL,
      duration_ms  INTEGER,
      error_msg    TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      raw_json TEXT NOT NULL,

      -- Plan usage (percentages only — no raw token counts exist)
      session_percent REAL,
      session_exact_percent REAL,
      session_reset_in TEXT,
      all_models_percent REAL,
      all_models_exact_percent REAL,
      all_models_resets_at TEXT,
      sonnet_percent REAL,
      sonnet_exact_percent REAL,
      sonnet_resets_at TEXT,
      last_updated TEXT,

      -- Extra usage (dollar amounts in user's local currency)
      amount_spent TEXT,
      spend_limit TEXT,
      spend_percent REAL,
      current_balance TEXT,
      auto_reload BOOLEAN,
      extra_reset_date TEXT,

      -- Account metadata
      plan TEXT,
      country TEXT
    )
  `);

  return db;
}

function insertSnapshot(data) {
  const stmt = db.prepare(`
    INSERT INTO scrape_snapshots (
      raw_json,
      session_percent, session_exact_percent, session_reset_in,
      all_models_percent, all_models_exact_percent, all_models_resets_at,
      sonnet_percent, sonnet_exact_percent, sonnet_resets_at,
      last_updated,
      amount_spent, spend_limit, spend_percent, current_balance,
      auto_reload, extra_reset_date,
      plan, country
    ) VALUES (
      @raw_json,
      @session_percent, @session_exact_percent, @session_reset_in,
      @all_models_percent, @all_models_exact_percent, @all_models_resets_at,
      @sonnet_percent, @sonnet_exact_percent, @sonnet_resets_at,
      @last_updated,
      @amount_spent, @spend_limit, @spend_percent, @current_balance,
      @auto_reload, @extra_reset_date,
      @plan, @country
    )
  `);

  const planUsage = data.planUsage || {};
  const extra = data.extraUsage || {};
  const exact = data.exactPercentages || {};
  const account = data.account || {};

  const row = {
    raw_json: JSON.stringify(data),
    session_percent: planUsage.currentSession?.percentUsed ?? null,
    session_exact_percent: exact.currentSession ?? null,
    session_reset_in: planUsage.currentSession?.resetIn ?? null,
    all_models_percent: planUsage.allModels?.percentUsed ?? null,
    all_models_exact_percent: exact.allModels ?? null,
    all_models_resets_at: planUsage.allModels?.resetsAt ?? null,
    sonnet_percent: planUsage.sonnetOnly?.percentUsed ?? null,
    sonnet_exact_percent: exact.sonnetOnly ?? null,
    sonnet_resets_at: planUsage.sonnetOnly?.resetsAt ?? null,
    last_updated: planUsage.lastUpdated ?? null,
    amount_spent: extra.amountSpent ?? null,
    spend_limit: extra.spendLimit ?? null,
    spend_percent: exact.extraUsageSpend ?? null,
    current_balance: extra.currentBalance ?? null,
    auto_reload: extra.autoReload == null ? null : extra.autoReload ? 1 : 0,
    extra_reset_date: extra.resetDate ?? null,
    plan: account.plan ?? null,
    country: account.country ?? null,
  };

  const info = stmt.run(row);
  return info.lastInsertRowid;
}

function getLatestSnapshot() {
  return db.prepare('SELECT * FROM scrape_snapshots ORDER BY id DESC LIMIT 1').get() || null;
}

function getSnapshots({ from, to, limit = 100 } = {}) {
  let sql = 'SELECT * FROM scrape_snapshots WHERE 1=1';
  const params = {};

  if (from) {
    sql += ' AND scraped_at >= @from';
    params.from = from;
  }
  if (to) {
    sql += ' AND scraped_at <= @to';
    params.to = to;
  }

  sql += ' ORDER BY scraped_at DESC LIMIT @limit';
  params.limit = limit;

  return db.prepare(sql).all(params);
}

function insertScrapeLog({ status, duration_ms = null, error_msg = null } = {}) {
  const stmt = db.prepare(`
    INSERT INTO scrape_log (completed_at, status, duration_ms, error_msg)
    VALUES (CURRENT_TIMESTAMP, @status, @duration_ms, @error_msg)
  `);
  const info = stmt.run({ status, duration_ms, error_msg });
  return info.lastInsertRowid;
}

function getRecentScrapeLog(limit = 20) {
  return db.prepare('SELECT * FROM scrape_log ORDER BY id DESC LIMIT ?').all(limit);
}

function getScheduleInfo() {
  const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '4', 10);
  return { intervalHours };
}

module.exports = {
  initDb,
  insertSnapshot, getLatestSnapshot, getSnapshots,
  insertScrapeLog, getRecentScrapeLog, getScheduleInfo,
};
