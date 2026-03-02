const crypto = require('crypto');

/**
 * Bearer token auth for the scraper POST endpoint.
 * Reads SCRAPE_API_KEY from env.
 */
function requireApiKey(req, res, next) {
  const expected = process.env.SCRAPE_API_KEY;
  if (!expected) {
    console.error('SCRAPE_API_KEY not set — rejecting POST request');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token || !timingSafeEqual(token, expected)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  next();
}

/**
 * HTTP Basic Auth for the history endpoint.
 * Reads HISTORY_USER and HISTORY_PASS from env.
 */
function requireBasicAuth(req, res, next) {
  const user = process.env.HISTORY_USER;
  const pass = process.env.HISTORY_PASS;

  if (!user || !pass) {
    console.error('HISTORY_USER/HISTORY_PASS not set — rejecting history request');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Usage History"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const [givenUser, ...passParts] = decoded.split(':');
  const givenPass = passParts.join(':');

  if (!timingSafeEqual(givenUser, user) || !timingSafeEqual(givenPass, pass)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Usage History"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { requireApiKey, requireBasicAuth };
