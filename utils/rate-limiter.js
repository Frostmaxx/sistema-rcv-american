function createRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map();

  function prune(now) {
    if (hits.size <= 5000) return;
    for (const [k, timestamps] of hits.entries()) {
      if (!timestamps.some(ts => now - ts < windowMs)) {
        hits.delete(k);
      }
    }
  }

  function middleware(req, res, next) {
    const key = keyFn ? keyFn(req) : (req.ip || req.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(ts => now - ts < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: message || 'Demasiadas solicitudes. Intente nuevamente más tarde.' });
    }
    recent.push(now);
    hits.set(key, recent);
    prune(now);
    next();
  }

  middleware.recordFailure = (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(ts => now - ts < windowMs);
    recent.push(now);
    hits.set(key, recent);
    prune(now);
  };

  middleware.isBlocked = (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(ts => now - ts < windowMs);
    return recent.length >= max;
  };

  middleware.resetKey = (key) => {
    hits.delete(key);
  };

  return middleware;
}

module.exports = { createRateLimiter };
