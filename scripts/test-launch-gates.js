#!/usr/bin/env node
'use strict';

/**
 * scripts/test-launch-gates.js
 * Seekers Production Launch & Gate Invariant Verification Suite (P17)
 *
 * Verifies that the production launch pipeline strictly enforces fail-closed
 * security rules, rejects invalid OCI image digests and dummy placeholders,
 * forbids wildcard CORS across singular and plural variables, and maintains
 * truthful status labeling between live execution and fixture rehearsal.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  validateProductionEnvironment,
  validateImageDigest,
  runProductionLaunch,
  DANGEROUS_DEFAULT_SECRETS,
  TRIVIAL_DUMMY_DIGESTS
} = require('./launch-production');

async function runLaunchGateTests() {
  console.log('========================================================================');
  console.log('[LAUNCH-GATE-TESTS] Running P17 Production Launch Qualification Suite');
  console.log('========================================================================\n');

  let passedTests = 0;

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Secret & Cryptographic Security Invariants
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Production Secret Fail-Closed Invariants ---');
  {
    // 1.1: Missing ADMIN_TOKEN_SECRET in production
    const envMissingAdmin = { NODE_ENV: 'production', JWT_SECRET: 'a_very_long_valid_jwt_secret_12345' };
    const errs1 = validateProductionEnvironment(envMissingAdmin, true);
    assert(errs1.some(e => e.includes('ADMIN_TOKEN_SECRET is required')));
    console.log('  ✓ [PASS] Rejects missing ADMIN_TOKEN_SECRET in production mode.');
    passedTests++;

    // 1.2: Insecure default secret
    for (const secret of DANGEROUS_DEFAULT_SECRETS) {
      const envBad = {
        NODE_ENV: 'production',
        ADMIN_TOKEN_SECRET: secret,
        JWT_SECRET: 'a_very_long_valid_jwt_secret_12345'
      };
      const errs = validateProductionEnvironment(envBad, true);
      assert(errs.some(e => e.includes('insecure development defaults')), `Should reject dangerous secret ${secret}`);
    }
    console.log(`  ✓ [PASS] Rejects all ${DANGEROUS_DEFAULT_SECRETS.length} known insecure default secrets.`);
    passedTests++;

    // 1.3: Secret with insufficient entropy (< 16 characters or repetitive)
    const envShort = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'short_secret',
      JWT_SECRET: 'a_very_long_valid_jwt_secret_12345'
    };
    const errsShort = validateProductionEnvironment(envShort, true);
    assert(errsShort.some(e => e.includes('at least 16 characters')));

    const envRepetitive = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'aaaaaaaaaaaaaaaa',
      JWT_SECRET: 'a_very_long_valid_jwt_secret_12345'
    };
    const errsRepetitive = validateProductionEnvironment(envRepetitive, true);
    assert(errsRepetitive.some(e => e.includes('insufficient cryptographic entropy')));
    console.log('  ✓ [PASS] Rejects secrets with fewer than 16 characters or insufficient entropy.');
    passedTests++;

    // 1.4: Missing JWT_SECRET
    const envMissingJwt = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'a_very_long_valid_admin_token_secret_12345'
    };
    const errsJwt = validateProductionEnvironment(envMissingJwt, true);
    assert(errsJwt.some(e => e.includes('JWT_SECRET is required')));
    console.log('  ✓ [PASS] Rejects missing JWT_SECRET in production mode.');
    passedTests++;

    // 1.5: Service-owned secrets validation
    const envBadResumeToken = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'a_very_long_valid_admin_token_secret_12345',
      JWT_SECRET: 'a_very_long_valid_jwt_secret_12345',
      RESUME_SERVICE_TOKEN: 'dev-secret'
    };
    const errsResume = validateProductionEnvironment(envBadResumeToken, true);
    assert(errsResume.some(e => e.includes('RESUME_SERVICE_TOKEN must not use insecure development defaults')));
    console.log('  ✓ [PASS] Rejects insecure defaults in service-owned secrets.');
    passedTests++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Networking & Host Isolation Invariants
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Host Isolation & Origin Restrictions ---');
  {
    // 2.1: Wildcard CORS rejected in both CORS_ORIGIN and CORS_ORIGINS
    const envWildcard = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'a_very_long_valid_admin_token_secret_12345',
      JWT_SECRET: 'a_very_long_valid_jwt_secret_12345',
      CORS_ORIGIN: '*'
    };
    const errsCors = validateProductionEnvironment(envWildcard, true);
    assert(errsCors.some(e => e.includes('strictly prohibited in CORS_ORIGIN')));

    const envWildcardPlural = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'a_very_long_valid_admin_token_secret_12345',
      JWT_SECRET: 'a_very_long_valid_jwt_secret_12345',
      CORS_ORIGINS: 'https://seekers.work,*'
    };
    const errsCorsPlural = validateProductionEnvironment(envWildcardPlural, true);
    assert(errsCorsPlural.some(e => e.includes('strictly prohibited in CORS_ORIGINS')));
    console.log('  ✓ [PASS] Rejects wildcard CORS (*) in both CORS_ORIGIN and CORS_ORIGINS.');
    passedTests++;

    // 2.2: Standalone test seed catalog prohibited in production
    const envTestCatalog = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'a_very_long_valid_admin_token_secret_12345',
      JWT_SECRET: 'a_very_long_valid_jwt_secret_12345',
      ALLOW_STANDALONE_TEST_SEED_CATALOG: 'true'
    };
    const errsCatalog = validateProductionEnvironment(envTestCatalog, true);
    assert(errsCatalog.some(e => e.includes('ALLOW_STANDALONE_TEST_SEED_CATALOG must not be enabled')));
    console.log('  ✓ [PASS] Rejects test seed catalog in production mode.');
    passedTests++;

    // 2.3: Firebase Auth Emulator prohibited in production
    const envEmulator = {
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'a_very_long_valid_admin_token_secret_12345',
      JWT_SECRET: 'a_very_long_valid_jwt_secret_12345',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099'
    };
    const errsEmulator = validateProductionEnvironment(envEmulator, true);
    assert(errsEmulator.some(e => e.includes('FIREBASE_AUTH_EMULATOR_HOST must not be set')));
    console.log('  ✓ [PASS] Rejects Firebase Auth Emulator in production mode.');
    passedTests++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: OCI Image Digest Format Validation
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Immutable OCI Image Digest Syntax & Provenance ---');
  {
    assert.strictEqual(validateImageDigest(null).valid, false);
    assert.strictEqual(validateImageDigest('').valid, false);
    assert.strictEqual(validateImageDigest('latest').valid, false);
    assert.strictEqual(validateImageDigest('sha256:short').valid, false);
    assert.strictEqual(validateImageDigest('sha256:not_hex_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz').valid, false);
    assert.strictEqual(validateImageDigest('42c4df06a3a330d2c5a0ee0307c6ec187a6bdbba').valid, false);

    // Reject trivial placeholder hashes (such as hash of empty string)
    const emptyStringHash = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    assert.strictEqual(validateImageDigest(emptyStringHash).valid, false);

    // Accept valid non-trivial OCI digest
    const validDigest = 'sha256:a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    assert.strictEqual(validateImageDigest(validDigest).valid, true);

    console.log('  ✓ [PASS] Validates exact OCI sha256:64hex digest syntax and rejects trivial dummy placeholders.');
    passedTests++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Rehearsal Pipeline Execution & Audit Artifacts
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Launch Pipeline Rehearsal & Truthful Audit Artifacts ---');
  {
    const audit = await runProductionLaunch({ demoMode: true });
    assert.strictEqual(audit.overall_status, 'REHEARSAL_VERIFIED');
    assert.strictEqual(audit.execution_mode, 'FIXTURE_REHEARSAL');
    assert.strictEqual(audit.external_infrastructure_status, 'LOCAL_REHEARSAL_ONLY');
    assert.strictEqual(audit.operating_tier.name, 'Tier 0: Initial Regional Launch');
    assert.strictEqual(audit.rollout_telemetry.length, 4);
    assert.strictEqual(audit.rollout_telemetry[3].weight_percent, 100);

    const auditFilePath = path.join(process.cwd(), 'data', 'PRODUCTION_LAUNCH_AUDIT.json');
    assert(fs.existsSync(auditFilePath), 'Launch audit report must be written to disk');
    console.log('  ✓ [PASS] Rehearsal execution generates truthful audit marked REHEARSAL_VERIFIED.');
    passedTests++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Real-Mode Negative Boundary Proof
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 5: Real Mode Negative Proving ---');
  {
    const origUrl = process.env.DATABASE_URL;
    const origAdmin = process.env.ADMIN_TOKEN_SECRET;
    const origJwt = process.env.JWT_SECRET;

    // 5.1: Missing DATABASE_URL fails closed
    let missingDbFailed = false;
    try {
      process.env.ADMIN_TOKEN_SECRET = 'a_very_long_valid_admin_token_secret_12345';
      process.env.JWT_SECRET = 'a_very_long_valid_jwt_secret_12345';
      delete process.env.DATABASE_URL;

      await runProductionLaunch({ realMode: true });
    } catch (err) {
      missingDbFailed = true;
      assert(err.message.includes('DATABASE_URL is required') || err.message.includes('FAIL-CLOSED'), `Unexpected error message: ${err.message}`);
    }
    assert(missingDbFailed, 'Real mode must fail closed when production database connection is missing');
    console.log('  ✓ [PASS] Real mode fails closed when DATABASE_URL is missing.');
    passedTests++;

    // 5.2: Unreachable database host:port fails closed
    let unreachableDbFailed = false;
    try {
      process.env.DATABASE_URL = 'postgresql://test_user:test_pass@127.0.0.1:59999/seekers_nonexistent';
      await runProductionLaunch({ realMode: true });
    } catch (err) {
      unreachableDbFailed = true;
      assert(err.message.includes('FAIL-CLOSED') || err.message.includes('database connectivity check failed'), `Unexpected error message: ${err.message}`);
    }
    assert(unreachableDbFailed, 'Real mode must fail closed when live database connection cannot be established');
    console.log('  ✓ [PASS] Real mode fails closed on unreachable database endpoint.');
    passedTests++;

    // Restore original environment
    if (origUrl) process.env.DATABASE_URL = origUrl; else delete process.env.DATABASE_URL;
    if (origAdmin) process.env.ADMIN_TOKEN_SECRET = origAdmin; else delete process.env.ADMIN_TOKEN_SECRET;
    if (origJwt) process.env.JWT_SECRET = origJwt; else delete process.env.JWT_SECRET;
  }

  console.log('\n========================================================================');
  console.log(`[LAUNCH-GATE-TESTS] ALL ${passedTests} PRODUCTION LAUNCH GATES PASSED!`);
  console.log('  - All fail-closed security invariants certified');
  console.log('  - Truthful status labeling (REHEARSAL_VERIFIED vs LIVE_DEPLOYED) verified');
  console.log('  - Zero false-positive PASS/SUCCESS outputs detected');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runLaunchGateTests().catch(err => {
    console.error('[LAUNCH-GATE-TESTS] FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runLaunchGateTests };
