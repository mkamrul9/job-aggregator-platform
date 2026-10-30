'use strict';

const crypto = require('crypto');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EXPIRATION_SECONDS = 90 * 24 * 3600; // 90 days maximum lifetime
const MAX_TOKEN_LENGTH = 2048;

/**
 * Resolves the dedicated unsubscribe HMAC secret.
 * In production or integrated SMTP mode, a non-empty configured secret is mandatory.
 */
function getUnsubscribeSecret() {
  const configured =
    process.env.ALERT_UNSUBSCRIBE_SECRET ||
    process.env.NOTIFICATIONS_TOKEN_SECRET;

  if (configured && configured.trim().length >= 16) {
    return configured.trim();
  }

  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.NOTIFICATION_MODE && process.env.NOTIFICATION_MODE.toUpperCase() === 'SMTP');

  if (isProd) {
    throw new Error(
      'ALERT_UNSUBSCRIBE_SECRET is required in production/SMTP mode with minimum 16 characters. Fallback secrets are strictly prohibited.'
    );
  }

  // Explicit isolated local-demo secret for tests & zero-dependency local mode
  return 'dev-demo-unsubscribe-isolated-key-p11';
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
 * @param {string} [options.scope='subscription'] - 'subscription' or 'all'
 * @param {number} [options.expiresInSeconds=2592000] - Default: 30 days, max: 90 days
 * @param {string} [options.secret] - Optional override secret
 * @returns {string} Signed token: `<base64urlPayload>.<signatureHex>`
 */
function generateUnsubscribeToken({
  subscriptionId,
  candidateId,
  email,
  scope = 'subscription',
  expiresInSeconds = 30 * 24 * 3600,
  secret = getUnsubscribeSecret(),
}) {
  if (!subscriptionId || typeof subscriptionId !== 'string') {
    throw new Error('subscriptionId is required to generate unsubscribe token');
  }
  if (!candidateId || typeof candidateId !== 'string') {
    throw new Error('candidateId is required to generate unsubscribe token');
  }
  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    throw new Error('A valid email address is required to generate unsubscribe token');
  }

  const expSec = Number(expiresInSeconds);
  const boundedExp = Number.isFinite(expSec)
    ? Math.min(expSec, MAX_EXPIRATION_SECONDS)
    : 30 * 24 * 3600;

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: subscriptionId.trim(),
    cand: candidateId.trim(),
    email: email.toLowerCase().trim(),
    scope: scope === 'all' ? 'all' : 'subscription',
    exp: nowSec + boundedExp,
    iat: nowSec,
    purpose: 'job_alert_unsubscribe',
  };

  const payloadB64 = base64UrlEncode(payload);
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies an unsubscribe token using timing-safe comparison and mandatory finite expiration.
 *
 * @param {string} token
 * @param {string} [secret]
 * @returns {{ valid: boolean, error?: string, subscriptionId?: string, candidateId?: string, email?: string, scope?: string, expiresAt?: number }}
 */
function verifyUnsubscribeToken(token, secret = getUnsubscribeSecret()) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'TOKEN_MISSING' };
  }

  if (token.length > MAX_TOKEN_LENGTH) {
    return { valid: false, error: 'TOKEN_TOO_LARGE' };
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'MALFORMED_TOKEN' };
  }

  const [payloadB64, signature] = parts;

  // Validate signature format (64-char hex)
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    return { valid: false, error: 'INVALID_SIGNATURE_FORMAT' };
  }

  // 1. Compute expected signature and compare with timing-safe equal
  let expectedSignature;
  try {
    expectedSignature = signPayload(payloadB64, secret);
  } catch (err) {
    return { valid: false, error: 'CRYPTO_ERROR' };
  }

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

  // 3. Validate strict field types, structure, and purpose
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'INVALID_PAYLOAD' };
  }

  if (payload.purpose !== 'job_alert_unsubscribe') {
    return { valid: false, error: 'INVALID_TOKEN_PURPOSE' };
  }

  if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
    return { valid: false, error: 'INVALID_SUBSCRIPTION_ID' };
  }

  if (typeof payload.cand !== 'string' || !payload.cand.trim()) {
    return { valid: false, error: 'INVALID_CANDIDATE_ID' };
  }

  if (typeof payload.email !== 'string' || !EMAIL_REGEX.test(payload.email.trim())) {
    return { valid: false, error: 'INVALID_EMAIL' };
  }

  // 4. Validate MANDATORY finite expiration
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, error: 'MISSING_MANDATORY_EXPIRATION' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > payload.exp) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  // 5. Validate issued-at bounds (cannot be issued more than 60 seconds in the future)
  if (typeof payload.iat === 'number' && payload.iat > nowSec + 60) {
    return { valid: false, error: 'TOKEN_ISSUED_IN_FUTURE' };
  }

  return {
    valid: true,
    subscriptionId: payload.sub.trim(),
    candidateId: payload.cand.trim(),
    email: payload.email.toLowerCase().trim(),
    scope: payload.scope === 'all' ? 'all' : 'subscription',
    expiresAt: payload.exp,
  };
}

/**
 * Resolves the dedicated candidate session token secret.
 */
function getCandidateSessionSecret() {
  const configured =
    process.env.CANDIDATE_SESSION_SECRET ||
    process.env.NOTIFICATIONS_TOKEN_SECRET ||
    process.env.ALERT_UNSUBSCRIBE_SECRET;

  if (configured && configured.trim().length >= 16) {
    return configured.trim();
  }

  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.NOTIFICATION_MODE && process.env.NOTIFICATION_MODE.toUpperCase() === 'SMTP');

  if (isProd) {
    throw new Error(
      'CANDIDATE_SESSION_SECRET is required in production mode with minimum 16 characters.'
    );
  }

  return 'dev-demo-candidate-session-key-p11';
}

/**
 * Generates an authenticated candidate session token for WebSocket rooms.
 */
function generateCandidateSessionToken({
  candidateId,
  expiresInSeconds = 3600,
  secret = getCandidateSessionSecret(),
}) {
  if (!candidateId || typeof candidateId !== 'string') {
    throw new Error('candidateId is required for candidate session token');
  }
  const boundedExp = Math.min(
    Math.max(Number(expiresInSeconds) || 3600, 60),
    MAX_EXPIRATION_SECONDS
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    cand: candidateId.trim(),
    purpose: 'candidate_session',
    exp: nowSec + boundedExp,
    iat: nowSec,
  };
  const payloadB64 = base64UrlEncode(payload);
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a candidate session token.
 * Strictly checks purpose === 'candidate_session'.
 * Rejects unsubscribe tokens if passed as session tokens.
 */
function verifyCandidateSessionToken(token, secret = getCandidateSessionSecret()) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'TOKEN_MISSING' };
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    return { valid: false, error: 'TOKEN_TOO_LARGE' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'MALFORMED_TOKEN' };
  }
  const [payloadB64, signature] = parts;
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    return { valid: false, error: 'INVALID_SIGNATURE_FORMAT' };
  }

  let expectedSignature;
  try {
    expectedSignature = signPayload(payloadB64, secret);
  } catch (err) {
    return { valid: false, error: 'CRYPTO_ERROR' };
  }
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expectedSignature, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }

  let payload;
  try {
    payload = base64UrlDecode(payloadB64);
  } catch (err) {
    return { valid: false, error: 'INVALID_PAYLOAD_JSON' };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'INVALID_PAYLOAD' };
  }

  if (payload.purpose !== 'candidate_session') {
    return {
      valid: false,
      error: 'INVALID_TOKEN_PURPOSE',
      expectedPurpose: 'candidate_session',
      receivedPurpose: payload.purpose,
    };
  }

  if (typeof payload.cand !== 'string' || !payload.cand.trim()) {
    return { valid: false, error: 'INVALID_CANDIDATE_ID' };
  }

  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, error: 'MISSING_MANDATORY_EXPIRATION' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > payload.exp) {
    return { valid: false, error: 'TOKEN_EXPIRED' };
  }

  return {
    valid: true,
    candidateId: payload.cand.trim(),
    expiresAt: payload.exp,
  };
}

module.exports = {
  getUnsubscribeSecret,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  getCandidateSessionSecret,
  generateCandidateSessionToken,
  verifyCandidateSessionToken,
  MAX_EXPIRATION_SECONDS,
  MAX_TOKEN_LENGTH,
};
