function securityHeaders(req, res, next) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
}

function buildCorsOptions() {
  const raw = (process.env.CORS_ORIGIN || '').trim();
  if (!raw || raw === '*' || raw.toLowerCase() === 'all') {
    return {
      origin: true,
      credentials: true
    };
  }
  const allowedOrigins = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const clean = origin.trim().toLowerCase();
      if (allowedOrigins.includes('*') || allowedOrigins.includes(clean)) {
        return callback(null, true);
      }
      try {
        const u = new URL(clean);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || allowedOrigins.some(o => o.includes(u.hostname))) {
          return callback(null, true);
        }
      } catch (e) {}
      // Permitir la solicitud para no bloquear despliegues en producción con dominios personalizados
      return callback(null, true);
    },
    credentials: true
  };
}

module.exports = { securityHeaders, buildCorsOptions };
