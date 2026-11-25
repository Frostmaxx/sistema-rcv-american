const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { signPolicyVerification, verifyPolicySignature } = require('../utils/qr-signature');
const { createRateLimiter } = require('../utils/rate-limiter');
const { extractCoverageItems } = require('../utils/coverages');
const { verifyEmergencyCredentials, getEmergencyConfig } = require('../utils/emergency-admin');
const { securityHeaders } = require('../middleware/security');

const BASE = process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}`;

test('securityHeaders sets X-Robots-Tag to block search engine indexing', () => {
  const headers = {};
  const req = { secure: false, headers: {} };
  const res = {
    setHeader(key, val) {
      headers[key.toLowerCase()] = val;
    }
  };
  let nextCalled = false;
  securityHeaders(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(headers['x-robots-tag'], 'noindex, nofollow, noarchive, nosnippet');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
});

test('QR HMAC signature verifies valid, rejects tampered, allows legacy', () => {
  const sig = signPolicyVerification('00000422');
  assert.match(sig, /^[0-9a-f]{16}$/);
  assert.equal(verifyPolicySignature('00000422', sig), 'valid');
  assert.equal(verifyPolicySignature('00000422', '0000000000000000'), 'invalid');
  assert.equal(verifyPolicySignature('00000422', ''), 'legacy');
});

test('Rate limiter blocks after max hits and resets cleanly', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(limiter.isBlocked('k1'), false);
  limiter.recordFailure('k1');
  limiter.recordFailure('k1');
  limiter.recordFailure('k1');
  assert.equal(limiter.isBlocked('k1'), true);
  limiter.resetKey('k1');
  assert.equal(limiter.isBlocked('k1'), false);
});

test('extractCoverageItems aggregates items and totals numerically', () => {
  const res = extractCoverageItems({
    prima: '33.00',
    cob_1_nombre: 'Daños a cosas',
    cob_1_monto: '2000.00',
    cob_2_nombre: 'Daños a personas',
    cob_2_monto: '2505.50'
  });
  assert.equal(res.prima, 33);
  assert.equal(res.totalMonto, 4505.5);
  assert.equal(res.items.length, 2);
});

test('Emergency superadmin credentials verify against .env configuration', async () => {
  const cfg = getEmergencyConfig();
  assert.ok(cfg.username);
  if (cfg.password) {
    assert.equal(await verifyEmergencyCredentials(cfg.username, cfg.password), true);
    assert.equal(await verifyEmergencyCredentials(cfg.username, 'wrong_pass'), false);
  }
});

test('Live server endpoints: health, emergency login, signed QR, CSV export & audit', async (t) => {
  let healthRes;
  try {
    healthRes = await fetch(`${BASE}/api/health`);
  } catch {
    t.skip('Servidor local no está activo en ' + BASE);
    return;
  }
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.db, 'connected');

  const cfg = getEmergencyConfig();
  if (!cfg.password) {
    t.skip('EMERGENCY_SUPERADMIN_PASSWORD no definido en .env');
    return;
  }

  // Login as emergency superadmin
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cfg.username, password: cfg.password })
  });
  assert.equal(loginRes.status, 200);
  const loginJson = await loginRes.json();
  assert.equal(loginJson.user.role, 'superadmin');
  const hdr = { Authorization: `Bearer ${loginJson.token}` };

  // Fetch policy 448 and verify signed QR vs tampered QR
  const polRes = await fetch(`${BASE}/api/policies/448`, { headers: hdr });
  assert.equal(polRes.status, 200);
  const polJson = await polRes.json();
  assert.ok(polJson.policy.qr_sig);

  const validQr = await fetch(`${BASE}/api/verify/${polJson.policy.policy_number}?sig=${polJson.policy.qr_sig}`);
  assert.equal(validQr.status, 200);
  const validQrJson = await validQr.json();
  assert.equal(validQrJson.policy.signature_status, 'valid');

  const badQr = await fetch(`${BASE}/api/verify/${polJson.policy.policy_number}?sig=deadbeefdeadbeef`);
  assert.equal(badQr.status, 403);

  // CSV export
  const csvRes = await fetch(`${BASE}/api/policies/export`, { headers: hdr });
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers.get('content-type') || '', /text\/csv/);

  // Audit logs accessible by superadmin
  const auditRes = await fetch(`${BASE}/api/audit?limit=5`, { headers: hdr });
  assert.equal(auditRes.status, 200);
  const auditJson = await auditRes.json();
  assert.ok(Array.isArray(auditJson.logs) && auditJson.logs.length > 0);
});
