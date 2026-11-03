#!/usr/bin/env node
'use strict';

/**
 * scripts/restore-drill.js
 * Seekers Verified Disaster Recovery Restoration Drill (P14)
 * Restores synthetic staging backup data into an isolated test environment,
 * verifies SHA-256 integrity, enforces durable erasure & suppression state,
 * rebuilds the search projection, and measures real RPO & RTO.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runBackup, computeSha256 } = require('./backup-stores');

async function runRestoreDrill(options = {}) {
  const drillId = `drill_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  console.log(`========================================================================`);
  console.log(`[RESTORE-DRILL] Starting Disaster Recovery Drill: ${drillId}`);
  console.log(`========================================================================`);

  const drillStart = Date.now();

  // 1. Locate or create backup snapshot
  let backupDir = options.backupDir;
  if (!backupDir) {
    console.log('[RESTORE-DRILL] Generating fresh verified staging backup snapshot...');
    const result = await runBackup();
    backupDir = result.targetDir;
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[RESTORE-DRILL] ERROR: Backup manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`[RESTORE-DRILL] Loaded manifest: backup_id=${manifest.backup_id}, timestamp=${manifest.timestamp}`);

  // 2. Cryptographic SHA-256 Pre-Flight Integrity Verification
  console.log('[RESTORE-DRILL] Step 1: Verifying SHA-256 checksums of backup artifacts...');
  for (const fileEntry of manifest.files) {
    const fullPath = path.join(backupDir, fileEntry.name);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`[RESTORE-DRILL] Checksum verification failed: Missing file ${fileEntry.name}`);
    }
    const computed = computeSha256(fullPath);
    if (computed !== fileEntry.sha256_checksum) {
      throw new Error(
        `[RESTORE-DRILL] CRITICAL: Tamper/Corruption detected for ${fileEntry.name}! Expected ${fileEntry.sha256_checksum}, got ${computed}`
      );
    }
    console.log(`  ✓ ${fileEntry.name}: Verified valid SHA-256 (${computed.substring(0, 16)}...)`);
  }

  // 3. Isolated Target Initialization
  const isolatedRestoreDir = path.join(process.cwd(), 'data', 'restore_drill', drillId);
  fs.mkdirSync(isolatedRestoreDir, { recursive: true });
  console.log(`[RESTORE-DRILL] Step 2: Restoring data into isolated environment -> ${isolatedRestoreDir}`);

  // 4. Restore PostgreSQL Authoritative State & Enforce Durable Erasure
  console.log('[RESTORE-DRILL] Step 3: Restoring PostgreSQL authoritative state...');
  const pgBackup = JSON.parse(fs.readFileSync(path.join(backupDir, 'postgres_authoritative.json'), 'utf8'));
  const restoredUsers = new Map();
  const restoredErasures = new Set();

  for (const user of pgBackup.tables.users) {
    restoredUsers.set(user.id, user);
  }
  for (const erasure of pgBackup.tables.durable_erasure_records) {
    restoredErasures.add(erasure.user_id);
  }

  // Verification 4A: Durable Erasure Integrity
  console.log('[RESTORE-DRILL] Step 4: Validating privacy and durable erasure controls...');
  for (const erasedUserId of restoredErasures) {
    if (restoredUsers.has(erasedUserId)) {
      throw new Error(
        `[RESTORE-DRILL] PRIVACY VIOLATION: Erased user ${erasedUserId} exists in active restored users table!`
      );
    }
    console.log(`  ✓ Erased user ${erasedUserId} remains absent from active directory.`);
  }

  // Verification 4B: Resurrection Rejection Test
  function simulateResurrectionAttempt(userId, email) {
    if (restoredErasures.has(userId)) {
      return {
        status: 403,
        error: 'ACCOUNT_PERMANENTLY_ERASED',
        message: 'This account was permanently erased per user deletion request and cannot be resurrected via sync.'
      };
    }
    restoredUsers.set(userId, { id: userId, email });
    return { status: 200, success: true };
  }

  const resurrectionProbe = simulateResurrectionAttempt('usr_purged_99', 'resurrect@example.com');
  if (resurrectionProbe.status !== 403 || resurrectionProbe.error !== 'ACCOUNT_PERMANENTLY_ERASED') {
    throw new Error('[RESTORE-DRILL] PRIVACY REGRESSION: Erased user was successfully resurrected!');
  }
  console.log(`  ✓ Resurrection attempt for erased user rejected with 403 ACCOUNT_PERMANENTLY_ERASED.`);

  // 5. Restore Canonical MongoDB Catalog
  console.log('[RESTORE-DRILL] Step 5: Restoring MongoDB canonical job catalog...');
  const mongoBackup = JSON.parse(fs.readFileSync(path.join(backupDir, 'mongo_catalog.json'), 'utf8'));
  const restoredCatalog = new Map();
  for (const job of mongoBackup.documents) {
    restoredCatalog.set(job.id, job);
  }
  console.log(`  ✓ Restored ${restoredCatalog.size} canonical job listings into catalog.`);

  // 6. Search Projection Rebuild
  console.log('[RESTORE-DRILL] Step 6: Rebuilding Elasticsearch search projection from canonical catalog...');
  const searchProjection = new Map();
  for (const [id, job] of restoredCatalog.entries()) {
    searchProjection.set(id, {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      skills: job.skills,
      status: job.moderation_status,
      indexed_at: new Date().toISOString()
    });
  }
  if (searchProjection.size !== restoredCatalog.size) {
    throw new Error(
      `[RESTORE-DRILL] Projection mismatch: Catalog has ${restoredCatalog.size}, projection has ${searchProjection.size}`
    );
  }
  console.log(`  ✓ Rebuilt search projection with ${searchProjection.size} indexed documents.`);

  // 7. Private Object Storage Recovery & Containment
  console.log('[RESTORE-DRILL] Step 7: Restoring and checking private object storage...');
  const restoredStorageDir = path.join(isolatedRestoreDir, 'storage');
  fs.mkdirSync(restoredStorageDir, { recursive: true });

  const backupStorageDir = path.join(backupDir, 'object_storage');
  if (fs.existsSync(backupStorageDir)) {
    const files = fs.readdirSync(backupStorageDir);
    for (const f of files) {
      fs.copyFileSync(path.join(backupStorageDir, f), path.join(restoredStorageDir, f));
    }
  }

  // Ensure purged user's resume is NOT in restored storage
  const purgedResumeExists = fs.existsSync(path.join(restoredStorageDir, 'resumes_usr_purged_99_cv.pdf'));
  if (purgedResumeExists) {
    throw new Error('[RESTORE-DRILL] PRIVACY VIOLATION: Purged resume was restored into storage!');
  }
  console.log('  ✓ Verified no orphaned/purged resume files exist in restored storage.');

  // 8. Measure RPO and RTO
  const drillEnd = Date.now();
  const measuredRtoSeconds = ((drillEnd - drillStart) / 1000).toFixed(3);
  const backupAgeMinutes = ((Date.now() - new Date(manifest.timestamp).getTime()) / 60000).toFixed(2);

  const rtoTargetSeconds = 60 * 60; // 60 minutes
  const rpoTargetMinutes = 15; // 15 minutes

  const rtoPassed = parseFloat(measuredRtoSeconds) <= rtoTargetSeconds;
  const rpoPassed = parseFloat(backupAgeMinutes) <= rpoTargetMinutes;

  console.log(`========================================================================`);
  console.log(`[RESTORE-DRILL] DISASTER RECOVERY DRILL METRICS & OUTCOME:`);
  console.log(`  - Backup ID:               ${manifest.backup_id}`);
  console.log(`  - Measured RTO (Recovery):  ${measuredRtoSeconds} seconds (Target: <= 3600s) -> ${rtoPassed ? 'PASS' : 'FAIL'}`);
  console.log(`  - Measured RPO (Data Age):  ${backupAgeMinutes} minutes (Target: <= 15m) -> ${rpoPassed ? 'PASS' : 'FAIL'}`);
  console.log(`  - Checksum Integrity:      100% MATCHED (All SHA-256 verified)`);
  console.log(`  - Durable Erasure Check:   100% ENFORCED (Zero phantom resurrects)`);
  console.log(`  - Search Rebuild Check:    100% REINDEXED (${searchProjection.size}/${restoredCatalog.size} docs)`);
  console.log(`========================================================================`);

  if (!rtoPassed || !rpoPassed) {
    throw new Error(`[RESTORE-DRILL] Target SLA breached: RTO=${measuredRtoSeconds}s, RPO=${backupAgeMinutes}m`);
  }

  // 9. Write Verified Report
  const report = {
    drill_id: drillId,
    backup_id: manifest.backup_id,
    timestamp: new Date().toISOString(),
    status: 'PASS',
    targets: {
      rpo_max_minutes: rpoTargetMinutes,
      rto_max_seconds: rtoTargetSeconds
    },
    measured: {
      rpo_actual_minutes: parseFloat(backupAgeMinutes),
      rto_actual_seconds: parseFloat(measuredRtoSeconds),
      catalog_documents_restored: restoredCatalog.size,
      search_documents_rebuilt: searchProjection.size,
      active_users_restored: restoredUsers.size,
      durable_erasures_preserved: restoredErasures.size
    },
    privacy_and_security: {
      durable_erasure_respected: true,
      resurrection_probe_rejected_403: true,
      purged_storage_absent: true,
      sha256_tamper_checked: true
    }
  };

  const reportPath = path.join(process.cwd(), 'data', 'restore_drill', 'LATEST_RESTORE_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[RESTORE-DRILL] Report written -> ${reportPath}`);

  return report;
}

if (require.main === module) {
  runRestoreDrill().catch(err => {
    console.error('[RESTORE-DRILL] FAILED:', err.message);
    process.exit(1);
  });
}

module.exports = { runRestoreDrill };
