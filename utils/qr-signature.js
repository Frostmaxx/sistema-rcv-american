const crypto = require('crypto');
const { getJwtSecret } = require('../middleware/auth');

function signPolicyVerification(policyNumber) {
  const clean = String(policyNumber || '').trim();
  if (!clean) return '';
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`rcv-verify:${clean}`)
    .digest('hex')
    .slice(0, 16);
}

function verifyPolicySignature(policyNumber, providedSig) {
  const sig = String(providedSig || '').trim().toLowerCase();
  if (!sig) return 'legacy';
  if (!/^[0-9a-f]{16}$/.test(sig)) return 'invalid';

  const expected = signPolicyVerification(policyNumber);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return 'invalid';
  return crypto.timingSafeEqual(a, b) ? 'valid' : 'invalid';
}

module.exports = { signPolicyVerification, verifyPolicySignature };
