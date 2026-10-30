'use strict';

const crypto = require('crypto');

function getUnsubscribeSecret() {
  return (
    process.env.ALERT_UNSUBSCRIBE_SECRET ||
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.JWT_SECRET ||
    'seekers-unsubscribe-secret-p11'
  );
}

/**
 * Encodes an object into a Base64URL string.
 */
function base64UrlEncode(obj) {
  const jsonStr = JSON.stringify(obj);
  return Buffer.from(jsonStr, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a Base64URL string back into an object.
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(jsonStr);
}

/**
 * Computes an HMAC-SHA256 signature for a given payload string.
 */
function signPayload(payloadStr, secret = getUnsubscribeSecret()) {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
}

/**
 * Generates a purpose-scoped, tamper-resistant unsubscribe token.
 *
 * @param {Object} options
 * @param {string} options.subscriptionId - ID of the alert subscription
 * @param {string} options.candidateId - ID of candidate owner
 * @param {string} options.email - Recipient email address
 * @param {number} [options.expiresInSeconds=2592000] - Default: 30 days
 * @param {string} [options.secret] - Optional override secret
 * @returns {string} Signed token: `<base64urlPayload>.<signatureHex>`
 */
function generateUnsubscribeToken({
  subscriptionId,
  candidateId,
  email,
  expiresInSeconds = 30 * 24 * 3600,
  secret = getUnsubscribeSecret(),
}) {
  if (!subscriptionId) throw new Error('subscriptionId is required to generate unsubscribe token');
  if (!candidateId) throw new Error('candidateId is required to generate unsubscribe token');
  if (!email) throw new Error('email is required to generate unsubscribe token');

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: subscriptionId,
    cand: candidateId,
    email: email.toLowerCase().trim(),
    exp: nowSec + expiresInSeconds,
    iat: nowSec,
    purpose: 'job_alert_unsubscribe',
  };

  const payloadB64 = base64UrlEncode(payload);
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies an unsubscribe token using timing-safe comparison.
 *
 * @param {string} token
 * @param {string} [secret]
 * @returns {{ valid: boolean, error?: string, subscriptionId?: string, candidateId?: string, email?: string, expiresAt?: number }}
 */
function verifyUnsubscribeToken(token, secret = getUnsubscribeSecret()) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'TOKEN_MISSING' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'MALFORMED_TOKEN' };
  }

  const [payloadB64, signature] = parts;

  // 1. Compute expected signature
  const expectedSignature = signPayload(payloadB64, secret);

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expectedSignature, 'hex');

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }

  // 2. Decode payload safely
  let payload;
  try {
    payload = base64UrlDecode(payloadB64);
  } catch (err) {
    return { valid: false, error: 'INVALID_PAYLOAD_JSON' };
  }

  // 3. Validate structure and purpose
  if (!payload || payload.purpose !== 'job_alert_unsubscribe' || !payload.sub || !payload.cand || !payload.email) {
    return { valid: false, error: 'INVALID_TOKEN_PURPOSE' };
  }

  // 4. Validate expiration
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && nowSec > payload.exp) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  return {
    valid: true,
    subscriptionId: payload.sub,
    candidateId: payload.cand,
    email: payload.email,
    expiresAt: payload.exp,
  };
}

module.exports = {
  getUnsubscribeSecret,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
};
