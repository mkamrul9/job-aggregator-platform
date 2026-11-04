#!/usr/bin/env node
'use strict';

/**
 * scripts/backup-stores.js
 * Seekers Authoritative Backup Pipeline (P14)
 * Generates an authenticated, verifiable snapshot of PostgreSQL authoritative state,
 * MongoDB job catalog, and private object storage with SHA-256 checksums and HMAC-signed manifest.
 *
 * Supports two operational modes:
 *  1. REAL MODE (--real): Connects to live databases (DATABASE_URL, MONGO_URI) and dumps live data.
 *     Fails closed (exit code 1) if databases are unreachable or dump fails.
 *  2. DEMO/REHEARSAL MODE (--demo, default without live DB flags): Generates labeled synthetic staging fixtures,
 *     explicitly marked as REHEARSAL_FIXTURE_DEMO.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KNOWN_INSECURE_FALLBACK_SECRET = 'seekers_backup_hmac_secret_p14_durable_key';

function canonicalJsonStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(key => JSON.stringify(key) + ':' + canonicalJsonStringify(obj[key])).join(',') + '}';
}

function resolveHmacSecret(providedSecret, isRealMode = false) {
  const secret = providedSecret || process.env.BACKUP_HMAC_SECRET;
  if (isRealMode) {
    if (!secret || secret === KNOWN_INSECURE_FALLBACK_SECRET) {
      throw new Error('[BACKUP] FAIL-CLOSED: BACKUP_HMAC_SECRET must be explicitly configured with an authentic secret in real mode (cannot use default or empty).');
    }
    if (secret.length < 32) {
      throw new Error('[BACKUP] FAIL-CLOSED: BACKUP_HMAC_SECRET must be at least 32 characters in real mode.');
    }
  }
  return secret || KNOWN_INSECURE_FALLBACK_SECRET;
}

function computeSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function computeManifestHmac(manifestObject, secret, isRealMode = false) {
  const resolvedSecret = resolveHmacSecret(secret, isRealMode);
  const shallowCopy = { ...manifestObject };
  delete shallowCopy.hmac_signature;
  const canonicalString = canonicalJsonStringify(shallowCopy);
  return crypto.createHmac('sha256', resolvedSecret).update(canonicalString).digest('hex');
}

function verifyManifestHmac(manifestObject, secret, isRealMode = false) {
  if (!manifestObject || !manifestObject.hmac_signature) return false;
  try {
    const expected = computeManifestHmac(manifestObject, secret, isRealMode);
    return crypto.timingSafeEqual(Buffer.from(manifestObject.hmac_signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

async function runBackup(options = {}) {
  const isRealMode = Boolean(
    options.realMode ||
    process.argv.includes('--real') ||
    (process.env.NODE_ENV === 'production' && !process.argv.includes('--demo') && !options.demoMode)
  );

  const targetDir =
    options.targetDir ||
    path.join(
      process.cwd(),
      'data',
      'backups',
      `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`
    );
  fs.mkdirSync(targetDir, { recursive: true });

  const startTime = Date.now();
  console.log(`[BACKUP] Starting backup pipeline in [${isRealMode ? 'REAL_STAGING_MODE' : 'REHEARSAL_FIXTURE_DEMO'}] -> ${targetDir}`);

  // Validate secret pre-flight
  const hmacSecret = resolveHmacSecret(options.secret, isRealMode);

  let postgresData;
  let mongoData;
  const storageFiles = [];

  if (isRealMode) {
    const dbUrl = process.env.DATABASE_URL;
    const mongoUri = process.env.MONGO_URI;

    if (!dbUrl) {
      const err = new Error('DATABASE_URL is required for real authoritative PostgreSQL backup.');
      console.error(`[BACKUP] FAIL-CLOSED: ${err.message}`);
      throw err;
    }
    if (!mongoUri) {
      const err = new Error('MONGO_URI is required for real canonical MongoDB backup.');
      console.error(`[BACKUP] FAIL-CLOSED: ${err.message}`);
      throw err;
    }

    try {
      console.log('[BACKUP] Querying real PostgreSQL authoritative tables...');
      const { Client } = require('pg');
      const pgClient = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
      await pgClient.connect();

      const usersRes = await pgClient.query('SELECT * FROM "User"');
      const profilesRes = await pgClient.query('SELECT * FROM "Profile"');
      const erasuresRes = await pgClient.query('SELECT * FROM "DurableErasureRecord"');
      const deletionReqsRes = await pgClient.query('SELECT * FROM "AccountDeletionRequest"');
      const trackedAppsRes = await pgClient.query('SELECT * FROM "TrackedApplication"');

      await pgClient.end();

      postgresData = {
        schema_version: '20261103000000_p13_durable_erasure_and_export',
        mode: 'LIVE_DATABASE_DUMP',
        exported_at: new Date().toISOString(),
        tables: {
          users: usersRes.rows,
          profiles: profilesRes.rows,
          durable_erasure_records: erasuresRes.rows,
          account_deletion_requests: deletionReqsRes.rows,
          tracked_applications: trackedAppsRes.rows
        }
      };
    } catch (pgErr) {
      console.error(`[BACKUP] PostgreSQL real dump failed: ${pgErr.message}`);
      throw pgErr;
    }

    try {
      console.log('[BACKUP] Querying real MongoDB canonical catalog & operational collections...');
      const { MongoClient } = require('mongodb');
      const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
      await mongoClient.connect();
      const db = mongoClient.db();

      const jobs = await db.collection('jobs').find({}).toArray();
      const sources = await db.collection('sources').find({}).toArray();
      const deadLetters = await db.collection('dead_letters').find({}).toArray();

      let audits = [];
      try {
        audits = await db.collection('audits').find({}).toArray();
      } catch {
        // collection may not exist yet
      }

      await mongoClient.close();

      mongoData = {
        mode: 'LIVE_DATABASE_DUMP',
        exported_at: new Date().toISOString(),
        record_count: jobs.length,
        collections: {
          jobs,
          sources,
          dead_letters: deadLetters,
          audits
        },
        documents: jobs
      };
    } catch (mongoErr) {
      console.error(`[BACKUP] MongoDB real dump failed: ${mongoErr.message}`);
      throw mongoErr;
    }

    // Real object storage copy
    const realStorageDir = process.env.OBJECT_STORAGE_DIR || path.join(process.cwd(), 'service-user', 'data', 'storage');
    const storageBackupDir = path.join(targetDir, 'object_storage');
    fs.mkdirSync(storageBackupDir, { recursive: true });

    if (fs.existsSync(realStorageDir)) {
      const liveFiles = fs.readdirSync(realStorageDir).filter(f => fs.statSync(path.join(realStorageDir, f)).isFile());
      for (const f of liveFiles) {
        const srcPath = path.join(realStorageDir, f);
        const dstPath = path.join(storageBackupDir, f);
        fs.copyFileSync(srcPath, dstPath);
        storageFiles.push({
          name: `object_storage/${f}`,
          type: 'Private Object Storage',
          path: dstPath,
          size_bytes: fs.statSync(dstPath).size,
          sha256_checksum: computeSha256(dstPath),
          record_count: 1
        });
      }
    }
  } else {
    // Demonstration Fixture Mode
    console.log('[BACKUP] Note: Running in REHEARSAL_FIXTURE_DEMO mode with verified synthetic data.');
    postgresData = options.customPostgresData || {
      schema_version: '20261103000000_p13_durable_erasure_and_export',
      mode: 'REHEARSAL_FIXTURE_DEMO',
      tables: {
        users: [
          {
            id: 'usr_active_01',
            email: 'active.candidate@example.com',
            role: 'CANDIDATE',
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
            profile: { headline: 'Senior Staff Engineer', location: 'Dhaka, BD' }
          },
          {
            id: 'usr_active_02',
            email: 'operator@seekers.careers',
            role: 'OPERATOR',
            created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
            profile: { headline: 'Catalog Lead', location: 'London, UK' }
          }
        ],
        profiles: [
          { id: 'prof_01', user_id: 'usr_active_01', headline: 'Senior Staff Engineer' }
        ],
        durable_erasure_records: [
          {
            id: 'erasure_usr_purged_99',
            user_id: 'usr_purged_99',
            erased_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            requested_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            ip_hash: crypto.createHash('sha256').update('192.168.1.1').digest('hex')
          }
        ],
        account_deletion_requests: [
          {
            id: 'del_req_pending_1',
            user_id: 'usr_active_01',
            status: 'CANCELLED',
            requested_at: new Date(Date.now() - 3600000 * 12).toISOString(),
            scheduled_for: new Date(Date.now() + 86400000 * 2).toISOString()
          }
        ],
        tracked_applications: [
          {
            id: 'app_01',
            user_id: 'usr_active_01',
            job_id: '8a2b53fa-5645-5d9c-a111-921d7b1a2001',
            status: 'APPLIED',
            applied_at: new Date(Date.now() - 86400000).toISOString()
          }
        ]
      }
    };

    mongoData = options.customMongoData || {
      collection: 'jobs',
      mode: 'REHEARSAL_FIXTURE_DEMO',
      exported_at: new Date().toISOString(),
      record_count: 3,
      documents: [
        {
          id: '8a2b53fa-5645-5d9c-a111-921d7b1a2001',
          title: 'Principal Distributed Systems Engineer',
          company: 'CloudScale Technologies',
          location: { raw: 'Dhaka, Bangladesh', city: 'Dhaka', country: 'Bangladesh', remote_type: 'HYBRID' },
          salary: { currency: 'BDT', min: 250000, max: 350000, period: 'MONTHLY' },
          skills: ['Go', 'Kafka', 'PostgreSQL', 'Docker'],
          moderation_status: 'ACTIVE',
          revision: 1,
          source_id: 'linkedin'
        },
        {
          id: '9b3c64fb-6756-6e0d-b222-032e8c2b3002',
          title: 'Fullstack AI Platform Engineer',
          company: 'Cognitive Nexus',
          location: { raw: 'Remote', city: null, country: null, remote_type: 'REMOTE' },
          salary: { currency: 'USD', min: 120000, max: 160000, period: 'YEARLY' },
          skills: ['Python', 'FastAPI', 'React', 'TypeScript', 'Docker'],
          moderation_status: 'ACTIVE',
          revision: 2,
          source_id: 'greenhouse'
        },
        {
          id: '1c4d75gc-7867-7f1e-c333-143f9d3c4003',
          title: 'Site Reliability & Infrastructure Specialist',
          company: 'FinTech Velocity',
          location: { raw: 'London, UK', city: 'London', country: 'United Kingdom', remote_type: 'ONSITE' },
          salary: { currency: 'GBP', min: 85000, max: 110000, period: 'YEARLY' },
          skills: ['Kubernetes', 'Linux', 'Terraform', 'Prometheus'],
          moderation_status: 'ACTIVE',
          revision: 1,
          source_id: 'lever'
        }
      ],
      dlq_quarantine: [
        {
          quarantine_id: 'dlq_001',
          reason: 'SCHEMA_VIOLATION_INVALID_HASH',
          quarantined_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          status: 'QUARANTINED'
        }
      ]
    };

    // Fixture storage object
    const storageBackupDir = path.join(targetDir, 'object_storage');
    fs.mkdirSync(storageBackupDir, { recursive: true });
    const activeResumePath = path.join(storageBackupDir, 'resumes_usr_active_01_cv.pdf');
    const pdfHeader = '%PDF-1.4\n1 0 obj\n<< /Title (Active Candidate Resume - Staging Demo) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
    fs.writeFileSync(activeResumePath, pdfHeader, 'utf8');

    storageFiles.push({
      name: 'object_storage/resumes_usr_active_01_cv.pdf',
      type: 'Private Object Storage',
      path: activeResumePath,
      size_bytes: fs.statSync(activeResumePath).size,
      sha256_checksum: computeSha256(activeResumePath),
      record_count: 1
    });
  }

  // 1. Write PostgreSQL Authoritative Snapshot
  const postgresBackupPath = path.join(targetDir, 'postgres_authoritative.json');
  fs.writeFileSync(postgresBackupPath, JSON.stringify(postgresData, null, 2), 'utf8');

  // 2. Write Canonical MongoDB Snapshot
  const mongoBackupPath = path.join(targetDir, 'mongo_catalog.json');
  fs.writeFileSync(mongoBackupPath, JSON.stringify(mongoData, null, 2), 'utf8');

  // 3. Assemble Files Array
  const files = [
    {
      name: 'postgres_authoritative.json',
      type: 'PostgreSQL Tables',
      path: postgresBackupPath,
      size_bytes: fs.statSync(postgresBackupPath).size,
      sha256_checksum: computeSha256(postgresBackupPath),
      record_count: postgresData.tables.users.length
    },
    {
      name: 'mongo_catalog.json',
      type: 'MongoDB Collections',
      path: mongoBackupPath,
      size_bytes: fs.statSync(mongoBackupPath).size,
      sha256_checksum: computeSha256(mongoBackupPath),
      record_count: mongoData.documents ? mongoData.documents.length : 0
    },
    ...storageFiles
  ];

  const manifest = {
    backup_id: path.basename(targetDir),
    timestamp: new Date().toISOString(),
    environment: isRealMode ? 'staging_real' : 'fixture_staging_demo',
    mode: isRealMode ? 'REAL_STAGING_BACKUP' : 'REHEARSAL_FIXTURE_DEMO',
    duration_ms: Date.now() - startTime,
    rpo_target_minutes: 15,
    rto_target_minutes: 60,
    encryption: 'UNENCRYPTED_SNAPSHOT_HMAC_AUTHENTICATED',
    files: files.map(({ name, type, size_bytes, sha256_checksum, record_count }) => ({
      name,
      type,
      size_bytes,
      sha256_checksum,
      record_count
    }))
  };

  manifest.hmac_signature = computeManifestHmac(manifest, hmacSecret, isRealMode);

  const manifestPath = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[BACKUP] SUCCESS: Snapshot complete in ${manifest.duration_ms}ms.`);
  console.log(`[BACKUP] Mode: ${manifest.mode}`);
  console.log(`[BACKUP] Manifest: ${manifestPath} (HMAC: ${manifest.hmac_signature.substring(0, 16)}...)`);
  files.forEach(f => {
    console.log(`  - ${f.name} (${f.size_bytes} bytes, SHA256: ${f.sha256_checksum.substring(0, 12)}...)`);
  });

  return { targetDir, manifest };
}

if (require.main === module) {
  runBackup().catch(err => {
    console.error('[BACKUP] Failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  runBackup,
  computeSha256,
  computeManifestHmac,
  verifyManifestHmac,
  canonicalJsonStringify,
  resolveHmacSecret,
  KNOWN_INSECURE_FALLBACK_SECRET
};
