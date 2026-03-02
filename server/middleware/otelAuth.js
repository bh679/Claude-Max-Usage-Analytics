function otelAuth(req, res, next) {
  const token = process.env.OTEL_BEARER_TOKEN;

  // If no token configured, skip auth (development mode)
  if (!token) return next();

  const authHeader = req.headers['authorization'] || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match || match[1] !== token) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing bearer token' });
  }

  next();
}

module.exports = otelAuth;
