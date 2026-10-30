'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  getUnsubscribeSecret,
  getCandidateSessionSecret,
  generateCandidateSessionToken,
  verifyCandidateSessionToken,
} = require('../src/crypto');

describe('service-notification: crypto & token tests', () => {
  it('generates a valid signed unsubscribe token and verifies successfully', () => {
    const token = generateUnsubscribeToken({
      subscriptionId: 'sub-1234',
      candidateId: 'usr_abc',
      email: 'Candidate@Example.com',
    });

    assert.strictEqual(typeof token, 'string');
    assert.ok(token.includes('.'));

    const verification = verifyUnsubscribeToken(token);
    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.subscriptionId, 'sub-1234');
    assert.strictEqual(verification.candidateId, 'usr_abc');
    assert.strictEqual(verification.email, 'candidate@example.com'); // normalized lowercase
    assert.ok(verification.expiresAt > Math.floor(Date.now() / 1000));
  });

  it('rejects tampered signature', () => {
    const token = generateUnsubscribeToken({
      subscriptionId: 'sub-1234',
      candidateId: 'usr_abc',
      email: 'candidate@example.com',
    });

    const [payloadB64] = token.split('.');
    const tamperedToken = `${payloadB64}.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;

    const result = verifyUnsubscribeToken(tamperedToken);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'INVALID_SIGNATURE');
  });

  it('rejects tampered payload', () => {
    const token = generateUnsubscribeToken({
      subscriptionId: 'sub-1234',
      candidateId: 'usr_abc',
      email: 'candidate@example.com',
    });

    const [, sig] = token.split('.');
    const fakePayloadB64 = Buffer.from(
      JSON.stringify({
        sub: 'sub-hacked',
        cand: 'usr_hacked',
        email: 'hacked@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        purpose: 'job_alert_unsubscribe',
      })
    ).toString('base64url');

    const tamperedToken = `${fakePayloadB64}.${sig}`;
    const result = verifyUnsubscribeToken(tamperedToken);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'INVALID_SIGNATURE');
  });

  it('rejects expired tokens', () => {
    const token = generateUnsubscribeToken({
      subscriptionId: 'sub-expired',
      candidateId: 'usr_exp',
      email: 'expired@example.com',
      expiresInSeconds: -60, // already expired
    });

    const result = verifyUnsubscribeToken(token);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'TOKEN_EXPIRED');
  });

  it('rejects token without mandatory expiration or non-finite expiration', () => {
    const secret = getUnsubscribeSecret();
    const payloadNoExp = {
      sub: 'sub-no-exp',
      cand: 'usr_no_exp',
      email: 'valid@example.com',
      purpose: 'job_alert_unsubscribe',
    };
    const b64NoExp = Buffer.from(JSON.stringify(payloadNoExp)).toString('base64url');
    const sigNoExp = crypto.createHmac('sha256', secret).update(b64NoExp).digest('hex');
    const tokenNoExp = `${b64NoExp}.${sigNoExp}`;

    const resNoExp = verifyUnsubscribeToken(tokenNoExp);
    assert.strictEqual(resNoExp.valid, false);
    assert.strictEqual(resNoExp.error, 'MISSING_MANDATORY_EXPIRATION');

    // String expiration
    const payloadStrExp = { ...payloadNoExp, exp: 'never' };
    const b64StrExp = Buffer.from(JSON.stringify(payloadStrExp)).toString('base64url');
    const sigStrExp = crypto.createHmac('sha256', secret).update(b64StrExp).digest('hex');
    const tokenStrExp = `${b64StrExp}.${sigStrExp}`;

    const resStrExp = verifyUnsubscribeToken(tokenStrExp);
    assert.strictEqual(resStrExp.valid, false);
    assert.strictEqual(resStrExp.error, 'MISSING_MANDATORY_EXPIRATION');
  });

  it('rejects tokens signed with a different secret', () => {
    const token = generateUnsubscribeToken({
      subscriptionId: 'sub-diff-secret',
      candidateId: 'usr_abc',
      email: 'cand@example.com',
      secret: 'a-different-secret-that-does-not-match-at-all-p11',
    });

    const res = verifyUnsubscribeToken(token); // verifies with default secret
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'INVALID_SIGNATURE');
  });

  it('rejects overlong tokens exceeding MAX_TOKEN_LENGTH', () => {
    const hugeToken = 'a'.repeat(2049);
    const res = verifyUnsubscribeToken(hugeToken);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'TOKEN_TOO_LARGE');
  });

  it('rejects malformed tokens and missing parameters', () => {
    assert.strictEqual(verifyUnsubscribeToken(null).valid, false);
    assert.strictEqual(verifyUnsubscribeToken('').valid, false);
    assert.strictEqual(verifyUnsubscribeToken('not-a-token-without-dot').valid, false);
    assert.strictEqual(verifyUnsubscribeToken('invalid.payload.extra').valid, false);

    assert.throws(() => {
      generateUnsubscribeToken({ candidateId: 'usr_1', email: 'a@b.com' });
    }, /subscriptionId is required/);

    assert.throws(() => {
      generateUnsubscribeToken({ subscriptionId: 'sub_1', email: 'a@b.com' });
    }, /candidateId is required/);
  });

  it('enforces mandatory non-empty secret in production mode', () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.ALERT_UNSUBSCRIBE_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALERT_UNSUBSCRIBE_SECRET;
      delete process.env.NOTIFICATIONS_TOKEN_SECRET;

      assert.throws(() => {
        getUnsubscribeSecret();
      }, /ALERT_UNSUBSCRIBE_SECRET is required in production\/SMTP mode/);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret) {
        process.env.ALERT_UNSUBSCRIBE_SECRET = origSecret;
      }
    }
  });

  it('generates and verifies dedicated candidate session tokens', () => {
    const sessionToken = generateCandidateSessionToken({
      candidateId: 'usr_cand_42',
      expiresInSeconds: 3600,
    });
    assert.strictEqual(typeof sessionToken, 'string');

    const verified = verifyCandidateSessionToken(sessionToken);
    assert.strictEqual(verified.valid, true);
    assert.strictEqual(verified.candidateId, 'usr_cand_42');
  });

  it('strictly isolates token purposes: unsubscribe token is rejected for candidate sessions', () => {
    const sessionSecret = getCandidateSessionSecret();
    const unsubToken = generateUnsubscribeToken({
      subscriptionId: 'sub-scope-test',
      candidateId: 'usr_hacker',
      email: 'hacker@example.com',
      secret: sessionSecret,
    });

    const result = verifyCandidateSessionToken(unsubToken, sessionSecret);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'INVALID_TOKEN_PURPOSE');
    assert.strictEqual(result.expectedPurpose, 'candidate_session');
    assert.strictEqual(result.receivedPurpose, 'job_alert_unsubscribe');
  });
});
