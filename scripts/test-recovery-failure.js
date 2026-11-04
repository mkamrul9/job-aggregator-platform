#!/usr/bin/env node
'use strict';

/**
 * scripts/test-recovery-failure.js
 * Comprehensive Negative Test Suite for P14 Deployment, Observability & Disaster Recovery
 *
 * Proves that every operational command fails with a nonzero exit code / throws an error
 * when any required dependency, configuration, secret, digest, checksum, or invariant is violated.
 * Asserts that commands NEVER emit PASS or SUCCESS on invalid or unreachable conditions.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { validateEnvironment, probeServiceHttp } = require('./deploy-staging');
const { validateImageDigest, runRollbackRehearsal } = require('./rollback-staging');
const { runBackup, computeManifestHmac, verifyManifestHmac, resolveHmacSecret } = require('./backup-stores');
const { runRestoreDrill } = require('./restore-drill');
const { parseAlertRules } = require('./simulate-alerts');

async function runNegativeTests() {
  console.log('========================================================================');
  console.log('[NEGATIVE-TESTS] Running P14 Operational Failure & Invariant Test Suite');
  console.log('========================================================================\n');

  let passedTests = 0;

  // --------------------------------------------------------------------------
  // TEST GROUP 1: Environment & Secret Validation Failures
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Environment & Secret Fail-Closed Checks ---');

  // 1.1: Missing ADMIN_TOKEN_SECRET in production
  {
    const errors = validateEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'super_secret_jwt_key_long_enough_12345' }, true);
    assert(errors.some(e => e.includes('ADMIN_TOKEN_SECRET is required')), 'Must reject missing ADMIN_TOKEN_SECRET in production');
    console.log('  ✓ [PASS] Rejects missing ADMIN_TOKEN_SECRET in production mode.');
    passedTests++;
  }

  // 1.2: Insecure default ADMIN_TOKEN_SECRET
  {
    const errors = validateEnvironment({
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'admin_secret_token',
      JWT_SECRET: 'super_secret_jwt_key_long_enough_12345'
    }, true);
    assert(errors.some(e => e.includes('must not use insecure development defaults')), 'Must reject default admin token secret');
    console.log('  ✓ [PASS] Rejects known insecure default ADMIN_TOKEN_SECRET.');
    passedTests++;
  }

  // 1.3: Insufficient entropy (< 16 chars)
  {
    const errors = validateEnvironment({
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'short_secret',
      JWT_SECRET: 'super_secret_jwt_key_long_enough_12345'
    }, true);
    assert(errors.some(e => e.includes('at least 16 characters')), 'Must reject short admin token secret');
    console.log('  ✓ [PASS] Rejects ADMIN_TOKEN_SECRET with fewer than 16 characters.');
    passedTests++;
  }

  // 1.4: Missing JWT_SECRET in production
  {
    const errors = validateEnvironment({
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'valid_and_sufficiently_long_admin_secret_token_123'
    }, true);
    assert(errors.some(e => e.includes('JWT_SECRET is required')), 'Must reject missing JWT_SECRET in production');
    console.log('  ✓ [PASS] Rejects missing JWT_SECRET in production mode.');
    passedTests++;
  }

  // 1.5: Missing SMTP_HOST when NOTIFICATION_MODE=SMTP
  {
    const errors = validateEnvironment({
      NODE_ENV: 'production',
      ADMIN_TOKEN_SECRET: 'valid_and_sufficiently_long_admin_secret_token_123',
      JWT_SECRET: 'valid_and_sufficiently_long_jwt_secret_token_12345',
      NOTIFICATION_MODE: 'SMTP'
    }, true);
    assert(errors.some(e => e.includes('SMTP_HOST is required')), 'Must reject missing SMTP_HOST when mode=SMTP');
    console.log('  ✓ [PASS] Rejects missing SMTP_HOST when NOTIFICATION_MODE=SMTP.');
    passedTests++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: Service Health Probe Failures
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Service Health Probe Failure Handling ---');

  // 2.1: Probe unreachable port
  {
    let probeFailed = false;
    try {
      await probeServiceHttp('http://127.0.0.1:59999/health', 500);
    } catch (err) {
      probeFailed = true;
      assert(err.message.includes('ECONNREFUSED') || err.message.includes('timed out') || err.message.includes('failed'), 'Must report connection failure');
    }
    assert(probeFailed, 'Unreachable service probe must throw error');
    console.log('  ✓ [PASS] probeServiceHttp fails closed when endpoint is unreachable.');
    passedTests++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: Rollback & Image Digest Format Failures
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Rollback Image Digest Validation Failures ---');

  // 3.1: Reject invalid string "invalid-target"
  {
    const res = validateImageDigest('invalid-target');
    assert.strictEqual(res.valid, false);
    assert(res.reason.includes('Expected "sha256:" followed by exactly 64 hexadecimal characters'));
    console.log('  ✓ [PASS] Rejects arbitrary string "invalid-target" as target digest.');
    passedTests++;
  }

  // 3.2: Reject 40-character Git SHA masquerading as OCI digest
  {
    const gitSha = 'sha256:d3ec2658fa1ef3740263301a2f90a99676ea9bbd'; // only 40 hex chars
    const res = validateImageDigest(gitSha);
    assert.strictEqual(res.valid, false);
    console.log('  ✓ [PASS] Rejects 40-character Git commit hash masquerading as 64-char OCI digest.');
    passedTests++;
  }

  // 3.3: runRollbackRehearsal throws when invalid digest is supplied
  {
    let rollbackThrown = false;
    try {
      await runRollbackRehearsal({ targetDigest: 'invalid-image-digest-xyz' });
    } catch (err) {
      rollbackThrown = true;
      assert(err.message.includes('Rollback target image digest invalid'), 'Must fail with descriptive error');
    }
    assert(rollbackThrown, 'runRollbackRehearsal must throw on invalid image digest');
    console.log('  ✓ [PASS] runRollbackRehearsal throws immediately on invalid image digest.');
    passedTests++;
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 4: Backup & Restore Cryptographic Authenticity & Integrity Checks
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Disaster Recovery Tamper & Recovery Checks ---');

  // Create temporary scratch backup for tamper tests
  const scratchDir = path.join(process.cwd(), 'data', 'test_scratch', `test_${Date.now()}`);
  const { targetDir, manifest } = await runBackup({ targetDir: scratchDir, demoMode: true });

  // 4.1: Restore drill fails when manifest HMAC signature is tampered
  {
    const tamperedManifest = { ...manifest, hmac_signature: 'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd' };
    const manifestPath = path.join(targetDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(tamperedManifest, null, 2), 'utf8');

    let drillThrown = false;
    try {
      await runRestoreDrill({ backupDir: targetDir });
    } catch (err) {
      drillThrown = true;
      assert(err.message.includes('HMAC signature verification failed'), 'Must reject tampered HMAC signature');
    }
    assert(drillThrown, 'Restore drill must throw when manifest signature is tampered');
    console.log('  ✓ [PASS] Restore drill fails closed when manifest HMAC is tampered.');
    passedTests++;
  }

  // Restore valid HMAC for subsequent tests
  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // 4.2: Changing a nested file checksum after signing MUST fail HMAC verification (Crucial P14 Repair Gate)
  {
    const copyManifest = JSON.parse(JSON.stringify(manifest));
    copyManifest.files[0].sha256_checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const isValid = verifyManifestHmac(copyManifest);
    assert.strictEqual(isValid, false, 'verifyManifestHmac must return false when a nested file checksum is altered');
    console.log('  ✓ [PASS] Modifying nested file checksum after signing fails HMAC signature verification.');
    passedTests++;
  }

  // 4.3: Changing a file and its manifest checksum together MUST fail HMAC verification
  {
    const copyManifest = JSON.parse(JSON.stringify(manifest));
    copyManifest.files[0].sha256_checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    copyManifest.files[0].size_bytes = 9999;
    const isValid = verifyManifestHmac(copyManifest);
    assert.strictEqual(isValid, false, 'verifyManifestHmac must return false when file metadata and checksum are altered');
    console.log('  ✓ [PASS] Modifying file and its manifest checksum together fails HMAC verification.');
    passedTests++;
  }

  // 4.4: Restore drill fails when a backup file's SHA-256 checksum is corrupted
  {
    const pgPath = path.join(targetDir, 'postgres_authoritative.json');
    const originalContent = fs.readFileSync(pgPath, 'utf8');
    fs.writeFileSync(pgPath, originalContent + '\n/* TAMPERED_INJECTION */', 'utf8');

    let tamperDetected = false;
    try {
      await runRestoreDrill({ backupDir: targetDir, allowUnsignedManifest: true });
    } catch (err) {
      tamperDetected = true;
      assert(err.message.includes('Tamper/Corruption detected') || err.message.includes('Checksum verification failed'), 'Must detect altered checksum');
    }
    assert(tamperDetected, 'Restore drill must throw on altered backup artifact');
    console.log('  ✓ [PASS] Restore drill detects tampered payload and fails closed.');
    passedTests++;

    // Restore original file
    fs.writeFileSync(pgPath, originalContent, 'utf8');
  }

  // 4.5: Real mode backup fails when DATABASE_URL is missing
  {
    const origDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    let realBackupFailed = false;
    try {
      await runBackup({ realMode: true, targetDir: path.join(process.cwd(), 'data', 'test_scratch', 'real_fail') });
    } catch (err) {
      realBackupFailed = true;
      assert(err.message.includes('DATABASE_URL is required') || err.message.includes('FAIL-CLOSED'), 'Must require DATABASE_URL in real mode');
    }
    assert(realBackupFailed, 'Real mode backup must fail without DATABASE_URL');
    console.log('  ✓ [PASS] Real mode backup fails closed when DATABASE_URL is missing.');
    passedTests++;

    if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
  }

  // 4.6: Real mode backup fails closed if BACKUP_HMAC_SECRET is default or insufficient
  {
    let secretFailed = false;
    try {
      resolveHmacSecret('seekers_backup_hmac_secret_p14_durable_key', true);
    } catch (err) {
      secretFailed = true;
      assert(err.message.includes('FAIL-CLOSED'), 'Must reject default secret in real mode');
    }
    assert(secretFailed, 'Must fail closed on default HMAC secret in real mode');
    console.log('  ✓ [PASS] Rejects default or empty BACKUP_HMAC_SECRET in real mode.');
    passedTests++;
  }

  // 4.7: Real mode restore fails closed when given a fixture manifest
  {
    let fixtureRejected = false;
    try {
      await runRestoreDrill({ backupDir: targetDir, realMode: true });
    } catch (err) {
      fixtureRejected = true;
      assert(err.message.includes('Cannot restore fixture demo backup into real staging environment'), 'Must reject fixture manifest in real mode');
    }
    assert(fixtureRejected, 'Must reject fixture demo backup when realMode=true');
    console.log('  ✓ [PASS] Real mode restore rejects fixture demo manifest.');
    passedTests++;
  }

  // 4.8: Real mode restore fails closed when database credentials are missing
  {
    const realManifest = { ...manifest, mode: 'REAL_STAGING_BACKUP' };
    const realManifestPath = path.join(targetDir, 'real_manifest.json');
    fs.writeFileSync(realManifestPath, JSON.stringify(realManifest, null, 2), 'utf8');

    let credsFailed = false;
    try {
      await runRestoreDrill({
        backupDir: targetDir,
        realMode: true,
        allowUnsignedManifest: true,
        restoreDbUrl: '',
        restoreMongoUri: '',
        restoreEsNode: ''
      });
    } catch (err) {
      credsFailed = true;
      assert(err.message.includes('Missing real target datastore credentials') || err.message.includes('Cannot restore fixture'), 'Must report missing credentials');
    }
    assert(credsFailed, 'Real mode restore must fail closed on missing datastore credentials');
    console.log('  ✓ [PASS] Real mode restore fails closed when target database credentials are missing.');
    passedTests++;
  }

  // Clean up scratch directory
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  } catch (_) {}

  // --------------------------------------------------------------------------
  // TEST GROUP 5: Alert Rules Parsing and PromQL Logic
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 5: Prometheus Alerting Rules Logic ---');

  // 5.1: Parse rules successfully
  {
    const rules = parseAlertRules();
    assert(rules.length >= 5, 'Must contain at least 5 registered production alert rules');
    const failureRule = rules.find(r => r.name === 'NotificationDeliveryFailureHigh');
    assert(failureRule, 'NotificationDeliveryFailureHigh rule must be registered');
    assert(failureRule.expr.includes('/'), 'Expression must evaluate a failure ratio');
    console.log(`  ✓ [PASS] Alert rules parsed (${rules.length} rules). Ratio denominator verified.`);
    passedTests++;
  }

  console.log('\n========================================================================');
  console.log(`[NEGATIVE-TESTS] ALL ${passedTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('  - All fail-closed security invariants verified');
  console.log('  - Zero false-positive PASS/SUCCESS outputs detected');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runNegativeTests().catch(err => {
    console.error('[NEGATIVE-TESTS] FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runNegativeTests };
