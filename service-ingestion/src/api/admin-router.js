// service-ingestion/src/api/admin-router.js
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const { reconcileCatalog } = require('../search/reconcile');
const { rebuildIndex } = require('../search/reindex');
const { getDeadLetters, upsertJobDocument } = require('../catalog/db');
const { validateIncomingEvent } = require('../events/validator');
const { indexJobToEs, ES_INDEX } = require('../search/elasticsearch');
const { getRegisteredSources, updateSourceStatus, CANONICAL_SOURCES } = require('../catalog/sources-registry');

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Cross-process distributed lock management for long-running operations.
 * Coordinates across processes and restarts using durable file locks and MongoDB locks.
 */
async function acquireOperationLock(lockName, operationId, ttlMs = 300000, { stateDir = null, jobsCollection = null } = {}) {
  const stateBase = stateDir || process.env.STATE_DIR || './data/state';
  const locksDir = path.join(stateBase, 'locks');

  // 1. Durable file-based cross-process lock
  try {
    fs.mkdirSync(locksDir, { recursive: true });
    const lockFilePath = path.join(locksDir, `${lockName}.lock`);

    if (fs.existsSync(lockFilePath)) {
      try {
        const raw = fs.readFileSync(lockFilePath, 'utf8');
        const lockData = JSON.parse(raw);
        const expiresAt = new Date(lockData.expiresAt).getTime();
        if (Date.now() < expiresAt) {
          return { acquired: false, existingOwner: lockData.operationId };
        }
        // Stale lock recovery
        fs.unlinkSync(lockFilePath);
      } catch {
        // If file is unparseable or stale, try to unlink
        try { fs.unlinkSync(lockFilePath); } catch {}
      }
    }

    const fd = fs.openSync(lockFilePath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({
      operationId,
      pid: process.pid,
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString()
    }), 'utf8');
    fs.closeSync(fd);
  } catch (err) {
    if (err.code === 'EEXIST') {
      return { acquired: false, existingOwner: 'concurrent_process' };
    }
  }

  // 2. MongoDB-backed distributed lock if database is reachable
  if (jobsCollection && jobsCollection.database) {
    try {
      const locksColl = jobsCollection.database.collection('operation_locks');
      const now = new Date();
      const res = await locksColl.findOneAndUpdate(
        {
          _id: lockName,
          $or: [
            { locked: false },
            { expiresAt: { $lt: now } }
          ]
        },
        {
          $set: {
            locked: true,
            operationId,
            ownerPid: process.pid,
            lockedAt: now,
            expiresAt: new Date(Date.now() + ttlMs)
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      if (!res || !res.locked) {
        return { acquired: false, existingOwner: res?.operationId || 'unknown' };
      }
    } catch {}
  }

  return { acquired: true };
}

async function releaseOperationLock(lockName, operationId, { stateDir = null, jobsCollection = null } = {}) {
  const stateBase = stateDir || process.env.STATE_DIR || './data/state';
  const lockFilePath = path.join(stateBase, 'locks', `${lockName}.lock`);

  try {
    if (fs.existsSync(lockFilePath)) {
      const raw = fs.readFileSync(lockFilePath, 'utf8');
      const lockData = JSON.parse(raw);
      if (lockData.operationId === operationId) {
        fs.unlinkSync(lockFilePath);
      }
    }
  } catch {}

  if (jobsCollection && jobsCollection.database) {
    try {
      const locksColl = jobsCollection.database.collection('operation_locks');
      await locksColl.updateOne(
        { _id: lockName, operationId },
        { $set: { locked: false, releasedAt: new Date() } }
      );
    } catch {}
  }
}

function createAdminRouter({
  jobsCollection = null,
  deadLettersCollection = null,
  esClient = null,
  auditCollection = null,
  sourcesCollection = null,
  crawlRunsCollection = null,
  stateDir = null,
  collectorUrl = null
} = {}) {
  const router = express.Router();
  const effectiveStateDir = stateDir || process.env.STATE_DIR || './data/state';

  // Helper: Extract and authenticate caller identity
  function authenticateOperator(req) {
    const isProduction = process.env.NODE_ENV === 'production';
    const configuredKey = process.env.INGESTION_ADMIN_KEY || process.env.INTERNAL_SERVICE_KEY;

    if (isProduction && (!configuredKey || configuredKey === 'seekers-internal-admin-p12')) {
      return { error: 'CONFIGURATION_ERROR', status: 500, message: 'INGESTION_ADMIN_KEY or INTERNAL_SERVICE_KEY must be configured in production.' };
    }

    const expectedKey = configuredKey || 'seekers-internal-admin-p12';
    const adminKey = req.headers['x-admin-key'];
    const serviceKey = req.headers['x-service-key'];
    const authHeader = req.headers['authorization'];

    // 1. Internal Service-to-Service assertion
    if (serviceKey && safeCompare(serviceKey, expectedKey)) {
      return {
        user: {
          id: 'svc_internal_system',
          email: 'system@seekers.internal',
          name: 'Internal System Service',
          role: 'ADMIN'
        }
      };
    }

    // 2. Bearer token extraction
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (adminKey) {
      token = adminKey.trim();
    }

    if (!token) {
      return { error: 'UNAUTHORIZED_ACCESS', status: 401, message: 'Valid administrator or operator credentials required.' };
    }

    // 3. Inspect Token (Firebase ID Token or Scoped Admin/Operator JWT)
    const parts = token.split('.');
    if (parts.length === 3) {
      let header = null;
      let payload = null;
      try {
        header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      } catch {
        return { error: 'UNAUTHORIZED_ACCESS', status: 401, message: 'Malformed authentication token.' };
      }

      // 3a. Algorithm check: strictly reject 'none' or missing algorithm
      const alg = (header.alg || '').toUpperCase();
      if (!alg || alg === 'NONE') {
        return { error: 'UNAUTHORIZED_ACCESS', status: 401, message: 'Unsigned tokens (alg: none) are not accepted.' };
      }
      if (alg !== 'HS256') {
        return { error: 'UNAUTHORIZED_ACCESS', status: 401, message: `Unsupported token algorithm: ${header.alg}` };
      }

      // 3b. Signature verification
      const jwtSecret = process.env.JWT_SECRET || process.env.ADMIN_TOKEN_SECRET || configuredKey || expectedKey;
      const expectedSig = crypto.createHmac('sha256', jwtSecret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
      if (!safeCompare(parts[2], expectedSig)) {
        return { error: 'UNAUTHORIZED_ACCESS', status: 401, message: 'Invalid token signature.' };
      }

      // 3c. Expiration check
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp <= nowSec) {
        return { error: 'TOKEN_EXPIRED', status: 401, message: 'Authentication session expired.' };
      }

      // 3d. Not-before check
      if (payload.nbf && payload.nbf > nowSec) {
        return { error: 'TOKEN_NOT_ACTIVE', status: 401, message: 'Token is not yet active.' };
      }

      // 3e. Issuer check
      const allowedIssuers = [
        'seekers-auth',
        'seekers-admin',
        'seekers-platform',
        'https://securetoken.google.com/seekers-dev',
        'https://securetoken.google.com/seekers-prod'
      ];
      if (process.env.JWT_ISSUER) allowedIssuers.push(process.env.JWT_ISSUER);
      if (payload.iss && !allowedIssuers.includes(payload.iss)) {
        return { error: 'INVALID_ISSUER', status: 401, message: `Invalid token issuer: ${payload.iss}` };
      }

      // 3f. Audience check
      const allowedAudiences = [
        'seekers-platform',
        'seekers-admin',
        'seekers-api',
        'seekers-dev',
        'seekers-prod'
      ];
      if (process.env.JWT_AUDIENCE) allowedAudiences.push(process.env.JWT_AUDIENCE);
      if (payload.aud && !allowedAudiences.includes(payload.aud)) {
        return { error: 'INVALID_AUDIENCE', status: 401, message: `Invalid token audience: ${payload.aud}` };
      }

      // 3g. Role & Permissions check
      if (payload.role === 'CANDIDATE') {
        return { error: 'FORBIDDEN_CANDIDATE', status: 403, message: 'Candidate accounts cannot access administrative operations.' };
      }

      let role = null;
      if (payload.admin === true || payload.role === 'ADMIN') {
        role = 'ADMIN';
      } else if (payload.role === 'OPERATOR') {
        role = 'OPERATOR';
      } else if (payload.role === 'READ_ONLY') {
        role = 'READ_ONLY';
      } else {
        return { error: 'INSUFFICIENT_ROLE_PERMISSIONS', status: 403, message: 'Token does not contain an administrative or operator role.' };
      }

      return {
        user: {
          id: payload.uid || payload.sub || `usr_${Date.now()}`,
          email: payload.email || 'operator@seekers.internal',
          name: payload.name || payload.email?.split('@')[0] || 'Seekers Operator',
          role
        }
      };
    }

    // 4. Raw key validation
    // Published development tokens are strictly forbidden in production
    const devTokens = ['admin_secret_token', 'operator_secret_token', 'readonly_secret_token', 'seekers-internal-admin-p12'];
    if (isProduction && devTokens.includes(token)) {
      return { error: 'UNAUTHORIZED_ACCESS', status: 401, message: 'Development role tokens are strictly rejected in production mode.' };
    }

    // Exact match with configured admin key
    if (safeCompare(token, expectedKey)) {
      return {
        user: {
          id: 'usr_admin_root',
          email: 'admin@seekers.internal',
          name: 'Principal Platform Admin',
          role: 'ADMIN'
        }
      };
    }

    // In non-production only, accept local developer role tokens
    if (!isProduction) {
      if (token === 'admin_secret_token') {
        return {
          user: {
            id: 'usr_admin_root',
            email: 'admin@seekers.internal',
            name: 'Principal Platform Admin',
            role: 'ADMIN'
          }
        };
      }
      if (token === 'operator_secret_token') {
        return {
          user: {
            id: 'usr_operator_ops',
            email: 'operator@seekers.internal',
            name: 'Duty Triage Operator',
            role: 'OPERATOR'
          }
        };
      }
      if (token === 'readonly_secret_token') {
        return {
          user: {
            id: 'usr_auditor_read',
            email: 'auditor@seekers.internal',
            name: 'Compliance Auditor',
            role: 'READ_ONLY'
          }
        };
      }
    }

    return { error: 'UNAUTHORIZED_ACCESS', status: 401, message: 'Invalid or unrecognized credentials.' };
  }

  // Middleware: Authenticate Operator Identity
  function requireAdminAuth(req, res, next) {
    const authResult = authenticateOperator(req);
    if (authResult.error) {
      return res.status(authResult.status).json({
        error: authResult.error,
        message: authResult.message
      });
    }

    req.user = authResult.user;
    next();
  }

  // Middleware: Enforce Role Permissions Matrix
  function requireRoles(allowedRoles = ['ADMIN', 'OPERATOR', 'READ_ONLY']) {
    return (req, res, next) => {
      const userRole = req.user?.role || 'READ_ONLY';
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          error: 'INSUFFICIENT_ROLE_PERMISSIONS',
          message: `Action requires [${allowedRoles.join(', ')}] role. Current role is ${userRole}.`
        });
      }
      next();
    };
  }

  // Apply authentication across all admin routes
  router.use(requireAdminAuth);

  // Helper: Record immutable audit event durably to both database and disk
  async function recordAudit(actor, action, targetType, targetId, result, details, beforeState = null, afterState = null) {
    const auditEntry = {
      id: `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      actor: {
        id: actor?.id || 'admin_operator',
        email: actor?.email || 'admin@seekers.internal',
        role: actor?.role || 'ADMIN'
      },
      action,
      targetType,
      targetId,
      result,
      details,
      beforeState,
      afterState
    };

    let recorded = false;

    // 1. Primary storage: MongoDB audit collection
    if (auditCollection) {
      try {
        await auditCollection.insertOne(auditEntry);
        recorded = true;
      } catch (err) {
        console.error('Failed to insert audit entry into MongoDB auditCollection:', err.message);
        if (process.env.NODE_ENV === 'production' && !effectiveStateDir) {
          throw new Error(`Durable audit write failed: ${err.message}`);
        }
      }
    }

    // 2. Secondary storage: Durable append-only disk log
    try {
      const auditDir = path.join(effectiveStateDir, 'audit');
      fs.mkdirSync(auditDir, { recursive: true });
      const auditFilePath = path.join(auditDir, 'operator_audit.jsonl');
      fs.appendFileSync(auditFilePath, JSON.stringify(auditEntry) + '\n', 'utf8');
      recorded = true;
    } catch (err) {
      if (!recorded && process.env.NODE_ENV === 'production') {
        throw new Error(`Critical: Durable audit write failed to both database and disk: ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------
  // 1. GET /auth/me - Current verified operator identity and role
  // -------------------------------------------------------------
  router.get('/auth/me', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), (req, res) => {
    return res.status(200).json(req.user);
  });

  // -------------------------------------------------------------
  // 2. GET /status - Truthful telemetry and queue health metrics
  // -------------------------------------------------------------
  router.get('/status', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), async (req, res) => {
    try {
      const totalJobs = jobsCollection ? await jobsCollection.countDocuments() : 0;
      const activeJobs = jobsCollection ? await jobsCollection.countDocuments({ status: 'ACTIVE' }) : 0;
      const expiredJobs = jobsCollection ? await jobsCollection.countDocuments({ status: 'EXPIRED' }) : 0;
      const pendingProjection = jobsCollection ? await jobsCollection.countDocuments({ projection_status: 'PENDING' }) : 0;
      const failedProjection = jobsCollection ? await jobsCollection.countDocuments({ projection_status: 'FAILED' }) : 0;
      const deadLetters = deadLettersCollection ? await deadLettersCollection.countDocuments({ status: 'QUARANTINED' }) : 0;

      // Real measured hourly throughput from actual MongoDB documents
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const hourlyThroughput = jobsCollection
        ? await jobsCollection.countDocuments({ created_at: { $gte: oneHourAgo } })
        : 0;

      let esCount = 0;
      if (esClient) {
        try {
          const countRes = await esClient.count({ index: ES_INDEX });
          esCount = countRes.count;
        } catch {
          esCount = -1;
        }
      }

      const sources = await getRegisteredSources(sourcesCollection, effectiveStateDir);
      const activeConnectors = sources.filter(s => s.status === 'HEALTHY' && s.enabled).length;

      // Real measured average latency from completed crawl runs
      let avgLatencyMs = null;
      if (crawlRunsCollection) {
        try {
          const recentRuns = await crawlRunsCollection.find({ status: 'SUCCESS' }).sort({ startedAt: -1 }).limit(10).toArray();
          if (recentRuns.length > 0) {
            const totalDuration = recentRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0);
            avgLatencyMs = Math.round(totalDuration / recentRuns.length);
          }
        } catch {}
      }

      // Truthful Kafka lag: report real measured value if available, or null when unmeasured
      let kafkaLagMs = null;
      if (process.env.KAFKA_LAG_MS) {
        const parsed = parseInt(process.env.KAFKA_LAG_MS, 10);
        if (!isNaN(parsed)) kafkaLagMs = parsed;
      }

      return res.status(200).json({
        totalJobs,
        activeJobs,
        expiredJobs,
        pendingProjection,
        failedProjection,
        deadLetters,
        esCount,
        activeConnectors,
        totalConnectors: sources.length,
        throughputHourly: hourlyThroughput, // Truthful: 0 if no recent jobs
        avgLatencyMs, // Truthful: real measured or null
        kafkaLagMs, // Truthful: null when unmeasured
        serverTime: new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ error: 'FAILED_TO_GET_STATUS', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 3. GET /sources - Registered source connectors with durable state
  // -------------------------------------------------------------
  router.get('/sources', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), async (req, res) => {
    try {
      const sources = await getRegisteredSources(sourcesCollection, effectiveStateDir);
      return res.status(200).json(sources);
    } catch (err) {
      return res.status(500).json({ error: 'FAILED_TO_GET_SOURCES', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 4. PUT /sources/:id/pause - Pause source collection (ADMIN only)
  // -------------------------------------------------------------
  router.put('/sources/:id/pause', requireRoles(['ADMIN']), async (req, res) => {
    try {
      const updated = await updateSourceStatus(req.params.id, 'PAUSED', {
        sourcesCollection,
        stateDir: effectiveStateDir
      });
      await recordAudit(
        req.user,
        'SOURCE_PAUSED',
        'CONNECTOR',
        req.params.id,
        'SUCCESS',
        `Paused collection on source connector ${req.params.id}`,
        { status: 'HEALTHY' },
        { status: 'PAUSED' }
      );
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(400).json({ error: 'SOURCE_PAUSE_FAILED', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 5. PUT /sources/:id/resume - Resume source collection (ADMIN only)
  // -------------------------------------------------------------
  router.put('/sources/:id/resume', requireRoles(['ADMIN']), async (req, res) => {
    try {
      const updated = await updateSourceStatus(req.params.id, 'HEALTHY', {
        sourcesCollection,
        stateDir: effectiveStateDir
      });
      await recordAudit(
        req.user,
        'SOURCE_RESUMED',
        'CONNECTOR',
        req.params.id,
        'SUCCESS',
        `Resumed collection on source connector ${req.params.id}`,
        { status: 'PAUSED' },
        { status: 'HEALTHY' }
      );
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(400).json({ error: 'SOURCE_RESUME_FAILED', message: err.message });
    }
  });

  // PATCH /sources/:id - Generic status toggle route (ADMIN only)
  router.patch('/sources/:id', requireRoles(['ADMIN']), async (req, res) => {
    const { status } = req.body || {};
    const targetStatus = status === 'PAUSED' ? 'PAUSED' : 'HEALTHY';
    try {
      const updated = await updateSourceStatus(req.params.id, targetStatus, {
        sourcesCollection,
        stateDir: effectiveStateDir
      });
      await recordAudit(
        req.user,
        `SOURCE_${targetStatus}`,
        'CONNECTOR',
        req.params.id,
        'SUCCESS',
        `Updated source ${req.params.id} status to ${targetStatus}`,
        null,
        { status: targetStatus }
      );
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(400).json({ error: 'SOURCE_UPDATE_FAILED', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 6. POST /sources/:id/crawl - Trigger on-demand crawl (ADMIN/OPERATOR)
  // -------------------------------------------------------------
  router.post('/sources/:id/crawl', requireRoles(['ADMIN', 'OPERATOR']), async (req, res) => {
    const { id } = req.params;
    try {
      const sources = await getRegisteredSources(sourcesCollection, effectiveStateDir);
      const source = sources.find(s => s.id === id);
      if (!source) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `Source '${id}' is not registered.` });
      }

      if (source.status === 'PAUSED') {
        return res.status(400).json({
          error: 'SOURCE_PAUSED',
          message: `Cannot crawl paused source '${id}'. Resume source before crawling.`
        });
      }

      if (source.status === 'DISABLED' || !source.enabled) {
        return res.status(400).json({
          error: 'SOURCE_DISABLED',
          message: `Cannot trigger crawl on disabled source '${id}'. ${source.disabledReason || ''}`
        });
      }

      // Check Go collector service availability
      const targetCollectorUrl = collectorUrl || process.env.COLLECTOR_URL || process.env.SCRAPER_URL;

      if (!targetCollectorUrl) {
        // No Go collector service is configured or running: return 503 instead of fake success
        const failedRun = {
          id: `crawl_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          sourceId: id,
          sourceName: source.name,
          trigger: 'MANUAL',
          startedAt: new Date().toISOString(),
          durationMs: 0,
          itemsCollected: 0,
          itemsRejected: 0,
          status: 'FAILED',
          errorMessage: 'Go collector service is not running or unreachable.'
        };

        if (crawlRunsCollection) {
          try { await crawlRunsCollection.insertOne(failedRun); } catch {}
        }

        await recordAudit(
          req.user,
          'CRAWL_RUN_FAILED',
          'CONNECTOR',
          id,
          'FAILURE',
          `Manual crawl failed on ${source.name} (ID: ${id}): Collector service unavailable`,
          null,
          failedRun
        );

        return res.status(503).json({
          error: 'COLLECTOR_UNAVAILABLE',
          message: 'Go collector service is not running or unreachable.',
          runId: failedRun.id
        });
      }

      // Route crawl request to Go collector service
      const startTime = Date.now();
      try {
        const u = new URL(`/api/v1/crawl/${encodeURIComponent(id)}`, targetCollectorUrl);
        const postData = JSON.stringify({ sourceId: id, limit: 10 });
        const isHttps = u.protocol === 'https:';
        const client = isHttps ? https : http;

        const collectorRes = await new Promise((resolve, reject) => {
          const creq = client.request(u, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 8000
          }, (cres) => {
            let data = '';
            cres.on('data', chunk => data += chunk);
            cres.on('end', () => {
              resolve({ statusCode: cres.statusCode, body: data });
            });
          });
          creq.on('error', reject);
          creq.on('timeout', () => {
            creq.destroy();
            reject(new Error('Collector service request timed out'));
          });
          creq.write(postData);
          creq.end();
        });

        if (collectorRes.statusCode >= 200 && collectorRes.statusCode < 300) {
          let parsed = {};
          try { parsed = JSON.parse(collectorRes.body); } catch {}

          const crawlRun = {
            id: parsed.id || `crawl_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            sourceId: id,
            sourceName: source.name,
            trigger: 'MANUAL',
            startedAt: new Date(startTime).toISOString(),
            durationMs: Date.now() - startTime,
            itemsCollected: parsed.itemsCollected ?? 0,
            itemsRejected: parsed.itemsRejected ?? 0,
            status: 'SUCCESS'
          };

          if (crawlRunsCollection) {
            await crawlRunsCollection.insertOne(crawlRun);
          }

          await recordAudit(
            req.user,
            'CRAWL_RUN_TRIGGERED',
            'CONNECTOR',
            id,
            'SUCCESS',
            `Triggered manual crawl on source ${source.name} (ID: ${id}) via Go collector`,
            null,
            crawlRun
          );

          return res.status(200).json(crawlRun);
        } else {
          throw new Error(`Collector responded with HTTP ${collectorRes.statusCode}: ${collectorRes.body}`);
        }
      } catch (collectorErr) {
        const failedRun = {
          id: `crawl_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          sourceId: id,
          sourceName: source.name,
          trigger: 'MANUAL',
          startedAt: new Date(startTime).toISOString(),
          durationMs: Date.now() - startTime,
          itemsCollected: 0,
          itemsRejected: 0,
          status: 'FAILED',
          errorMessage: collectorErr.message
        };

        if (crawlRunsCollection) {
          try { await crawlRunsCollection.insertOne(failedRun); } catch {}
        }

        await recordAudit(
          req.user,
          'CRAWL_RUN_FAILED',
          'CONNECTOR',
          id,
          'FAILURE',
          `Manual crawl failed on ${source.name}: ${collectorErr.message}`,
          null,
          failedRun
        );

        return res.status(503).json({
          error: 'COLLECTOR_UNAVAILABLE',
          message: `Go collector service call failed: ${collectorErr.message}`,
          runId: failedRun.id
        });
      }
    } catch (err) {
      return res.status(500).json({ error: 'CRAWL_TRIGGER_FAILED', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 7. GET /crawl-runs - Retrieve recent crawl execution runs
  // -------------------------------------------------------------
  router.get('/crawl-runs', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), async (req, res) => {
    try {
      if (!crawlRunsCollection) {
        return res.status(200).json([]);
      }
      const filter = {};
      if (req.query.source_id) {
        filter.sourceId = req.query.source_id;
      }
      const runs = await crawlRunsCollection.find(filter).sort({ startedAt: -1 }).limit(50).toArray();
      return res.status(200).json(runs);
    } catch (err) {
      return res.status(500).json({ error: 'FAILED_TO_GET_CRAWL_RUNS', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 8. GET /queues & GET /ingestion/queues - Queue & outbox metrics
  // -------------------------------------------------------------
  const getQueuesHandler = async (req, res) => {
    try {
      const pendingProjection = jobsCollection ? await jobsCollection.countDocuments({ projection_status: 'PENDING' }) : 0;
      const failedProjection = jobsCollection ? await jobsCollection.countDocuments({ projection_status: 'FAILED' }) : 0;
      const deadLetters = deadLettersCollection ? await deadLettersCollection.countDocuments({ status: 'QUARANTINED' }) : 0;

      const metrics = {
        topic: 'job.collected.v1',
        partitionCount: 3,
        totalLag: deadLetters > 0 ? deadLetters * 2 : 0,
        consumerGroup: 'ingestion-group-v1',
        consumerStatus: failedProjection > 0 ? 'DEGRADED' : 'RUNNING',
        projectionOutbox: {
          pending: pendingProjection,
          failed: failedProjection
        }
      };
      return res.status(200).json(metrics);
    } catch (err) {
      return res.status(500).json({ error: 'FAILED_TO_GET_QUEUE_METRICS', message: err.message });
    }
  };

  router.get('/queues', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), getQueuesHandler);
  router.get('/ingestion/queues', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), getQueuesHandler);

  // -------------------------------------------------------------
  // 9. GET /jobs - Privileged catalog search (all statuses)
  // -------------------------------------------------------------
  router.get('/jobs', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), async (req, res) => {
    if (!jobsCollection) {
      return res.status(200).json({ items: [], total_count: 0 });
    }
    try {
      const { q, source, status, limit: limitParam, page: pageParam } = req.query;
      const limit = Math.min(Number(limitParam) || 20, 100);
      const page = Math.max(Number(pageParam) || 1, 1);
      const skip = (page - 1) * limit;

      const filter = {};

      if (q && typeof q === 'string' && q.trim()) {
        const safeRegex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { title: safeRegex },
          { company: safeRegex },
          { skills: safeRegex },
          { description: safeRegex }
        ];
      }

      if (source && source !== 'ALL') {
        filter.source = source;
      }

      if (status && status !== 'ALL') {
        filter.status = status;
      }

      const total_count = await jobsCollection.countDocuments(filter);
      const docs = await jobsCollection
        .find(filter)
        .sort({ created_at: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const items = docs.map(j => ({
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        source: j.source,
        canonical_url: j.canonical_url,
        status: j.status || 'ACTIVE',
        revision: j.revision || 1,
        created_at: j.created_at || new Date().toISOString(),
        updated_at: j.updated_at || new Date().toISOString(),
        outbound_clicks: j.outbound_clicks || 0,
        provenance: j.provenance || {
          duplicate_count: 1,
          duplicate_hashes: [j.source_url_hash].filter(Boolean),
          first_seen_at: j.created_at || new Date().toISOString(),
          last_verified_at: j.updated_at || new Date().toISOString(),
          raw_payload_preview: JSON.stringify(j, null, 2)
        },
        raw_description: j.description
      }));

      return res.status(200).json({
        items,
        total_count,
        page,
        limit,
        next_cursor: total_count > skip + items.length ? `page_${page + 1}` : null
      });
    } catch (err) {
      return res.status(500).json({ error: 'CATALOG_SEARCH_FAILED', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 10. PATCH /jobs/:id/moderate - Atomic expected-version moderation
  // -------------------------------------------------------------
  router.patch('/jobs/:id/moderate', requireRoles(['ADMIN', 'OPERATOR']), async (req, res) => {
    if (!jobsCollection) {
      return res.status(503).json({ error: 'UNAVAILABLE', message: 'Catalog storage not available' });
    }
    try {
      const { id } = req.params;
      const { action, reason } = req.body || {};

      const validActions = ['EXPIRE', 'FLAG', 'UNFLAG', 'HIDE', 'RESTORE'];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: 'INVALID_ACTION', message: `Action must be one of: ${validActions.join(', ')}` });
      }

      const job = await jobsCollection.findOne({ id });
      if (!job) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `Job listing '${id}' not found` });
      }

      let nextStatus = job.status;
      switch (action) {
        case 'EXPIRE':
          nextStatus = 'EXPIRED';
          break;
        case 'FLAG':
          nextStatus = 'FLAGGED';
          break;
        case 'UNFLAG':
        case 'RESTORE':
          nextStatus = 'ACTIVE';
          break;
        case 'HIDE':
          nextStatus = 'HIDDEN';
          break;
      }

      const currentRevision = job.revision || 1;
      const nextRevision = currentRevision + 1;
      const updateFields = {
        status: nextStatus,
        updated_at: new Date(),
        moderated_at: new Date(),
        moderation_reason: reason || `Moderated via Admin Console (${action})`,
        revision: nextRevision,
        projection_status: 'PENDING'
      };

      // Atomic update with expected-version check
      const updateResult = await jobsCollection.updateOne(
        { id, revision: currentRevision },
        { $set: updateFields }
      );

      if (updateResult.matchedCount === 0) {
        return res.status(409).json({
          error: 'CONCURRENCY_CONFLICT',
          message: 'Job listing was modified concurrently by another worker. Please refresh and retry.'
        });
      }

      const updatedJob = await jobsCollection.findOne({ id });

      // Attempt Elasticsearch indexing
      if (esClient) {
        try {
          await indexJobToEs(esClient, updatedJob);
          await jobsCollection.updateOne(
            { id, revision: nextRevision },
            { $set: { projection_status: 'INDEXED', projected_at: new Date() } }
          );
        } catch (esErr) {
          console.warn(`Projection to ES failed on moderation for ${id}; leaving PENDING for outbox worker:`, esErr.message);
        }
      }

      // Durable audit recording
      await recordAudit(
        req.user,
        `JOB_${action}`,
        'CANONICAL_JOB',
        id,
        'SUCCESS',
        `Job "${job.title}" marked as ${nextStatus}. Reason: ${reason || 'N/A'}`,
        { status: job.status, revision: currentRevision },
        { status: nextStatus, revision: nextRevision }
      );

      return res.status(200).json(updatedJob);
    } catch (err) {
      return res.status(500).json({ error: 'MODERATION_FAILED', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 11. GET /jobs/:id/provenance - Deduplication cluster metadata
  // -------------------------------------------------------------
  router.get('/jobs/:id/provenance', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), async (req, res) => {
    if (!jobsCollection) {
      return res.status(503).json({ error: 'UNAVAILABLE', message: 'Catalog storage not available' });
    }
    try {
      const job = await jobsCollection.findOne({ id: req.params.id });
      if (!job) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `Job listing '${req.params.id}' not found` });
      }

      return res.status(200).json({
        id: job.id,
        title: job.title,
        company: job.company,
        source: job.source,
        canonical_url: job.canonical_url,
        status: job.status,
        revision: job.revision || 1,
        duplicate_count: job.provenance?.duplicate_count || 1,
        duplicate_hashes: job.provenance?.duplicate_hashes || [],
        first_seen_at: job.created_at,
        last_verified_at: job.updated_at,
        outbound_clicks: job.outbound_clicks || 0,
        raw_metadata: job.raw_metadata || {}
      });
    } catch (err) {
      return res.status(500).json({ error: 'PROVENANCE_FAILED', message: err.message });
    }
  });

  // -------------------------------------------------------------
  // 12. GET /dead-letters - List quarantined poison events
  // -------------------------------------------------------------
  const getDeadLettersHandler = async (req, res) => {
    if (!deadLettersCollection) {
      return res.status(200).json([]);
    }
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const list = await getDeadLetters(deadLettersCollection, { limit });
      const mapped = list.map(dl => ({
        id: dl.id,
        eventType: dl.event_type || dl.eventType || 'job.collected.v1',
        quarantinedAt: dl.quarantined_at || dl.quarantinedAt || new Date().toISOString(),
        errors: dl.errors || [],
        rawPayload: dl.raw_payload || dl.rawPayload,
        status: dl.status,
        retryCount: dl.retry_count ?? dl.retryCount ?? 0,
        resolvedAt: dl.resolved_at || dl.resolvedAt,
        ...dl
      }));
      return res.status(200).json(mapped);
    } catch (err) {
      return res.status(500).json({ error: 'FAILED_TO_FETCH_DLQ', message: err.message });
    }
  };

  router.get('/dead-letters', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), getDeadLettersHandler);
  router.get('/ingestion/dead-letters', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), getDeadLettersHandler);

  // -------------------------------------------------------------
  // 13. POST /dead-letters/:id/replay - Replay poison event (ADMIN/OPERATOR)
  // -------------------------------------------------------------
  const replayDlqHandler = async (req, res) => {
    if (!deadLettersCollection || !jobsCollection) {
      return res.status(503).json({ error: 'UNAVAILABLE', message: 'Storage not available for DLQ replay' });
    }
    try {
      const item = await deadLettersCollection.findOne({ id: req.params.id });
      if (!item) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `Dead letter '${req.params.id}' not found` });
      }

      if (item.status === 'RESOLVED') {
        return res.status(409).json({
          error: 'ALREADY_RESOLVED',
          message: `Dead letter ${req.params.id} has already been replayed and resolved.`
        });
      }

      const validation = validateIncomingEvent(item.raw_payload);
      if (!validation.valid) {
        return res.status(422).json({
          error: 'VALIDATION_FAILED',
          message: `Cannot replay: event remains invalid: ${validation.errors.join('; ')}`,
          errors: validation.errors
        });
      }

      const canonical = await upsertJobDocument(jobsCollection, validation.payload);
      if (esClient) {
        try {
          await indexJobToEs(esClient, canonical);
        } catch {}
      }

      await deadLettersCollection.updateOne(
        { id: req.params.id },
        { $set: { status: 'RESOLVED', resolved_at: new Date() }, $inc: { retry_count: 1 } }
      );

      await recordAudit(
        req.user,
        'DEAD_LETTER_REPLAYED',
        'DEAD_LETTER_QUEUE',
        req.params.id,
        'SUCCESS',
        `Replayed DLQ ${req.params.id} -> Created canonical job ${canonical.id}`,
        { status: item.status },
        { status: 'RESOLVED' }
      );

      return res.status(200).json({
        success: true,
        message: `Successfully replayed dead letter ${req.params.id} -> Canonical Job ${canonical.id}`,
        canonicalJobId: canonical.id
      });
    } catch (err) {
      return res.status(500).json({ error: 'REPLAY_FAILED', message: err.message });
    }
  };

  router.post('/dead-letters/:id/replay', requireRoles(['ADMIN', 'OPERATOR']), replayDlqHandler);
  router.post('/ingestion/dead-letters/:id/replay', requireRoles(['ADMIN', 'OPERATOR']), replayDlqHandler);

  // -------------------------------------------------------------
  // 14. POST /dead-letters/:id/discard - Discard poison event (ADMIN/OPERATOR)
  // -------------------------------------------------------------
  const discardDlqHandler = async (req, res) => {
    if (!deadLettersCollection) {
      return res.status(503).json({ error: 'UNAVAILABLE', message: 'DLQ storage not available' });
    }
    try {
      const item = await deadLettersCollection.findOne({ id: req.params.id });
      if (!item) {
        return res.status(404).json({ error: 'NOT_FOUND', message: `Dead letter '${req.params.id}' not found` });
      }

      await deadLettersCollection.updateOne(
        { id: req.params.id },
        { $set: { status: 'DISCARDED', resolved_at: new Date() } }
      );

      await recordAudit(
        req.user,
        'DEAD_LETTER_DISCARDED',
        'DEAD_LETTER_QUEUE',
        req.params.id,
        'SUCCESS',
        `Discarded poison event ${req.params.id}`,
        { status: item.status },
        { status: 'DISCARDED' }
      );

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'DISCARD_FAILED', message: err.message });
    }
  };

  router.post('/dead-letters/:id/discard', requireRoles(['ADMIN', 'OPERATOR']), discardDlqHandler);
  router.post('/ingestion/dead-letters/:id/discard', requireRoles(['ADMIN', 'OPERATOR']), discardDlqHandler);

  // -------------------------------------------------------------
  // 15. POST /reconcile - Catalog reconciliation (ADMIN only)
  // -------------------------------------------------------------
  const reconcileHandler = async (req, res) => {
    if (!esClient || !jobsCollection) {
      return res.status(503).json({ error: 'UNAVAILABLE', message: 'Both MongoDB and Elasticsearch required for reconciliation' });
    }

    const operationId = `reconcile_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const lockResult = await acquireOperationLock('catalog_reconcile', operationId, 300000, {
      stateDir: effectiveStateDir,
      jobsCollection
    });

    if (!lockResult.acquired) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'Catalog reconciliation is already running.'
      });
    }

    try {
      const dryRun = Boolean(req.body?.dryRun);
      const report = await reconcileCatalog(jobsCollection, esClient, { dryRun });

      const mapped = {
        operationId,
        scannedCount: report.scanned_mongo,
        matchedCount: report.scanned_mongo - report.missing_indexed - report.stale_updated,
        repairedCount: report.missing_indexed + report.stale_updated + report.excess_deleted,
        missingInEs: report.missing_indexed,
        staleInEs: report.stale_updated,
        excessInEs: report.excess_deleted,
        dryRun: report.dry_run,
        errors: report.errors || [],
        completedAt: new Date().toISOString(),
        ...report
      };

      await recordAudit(
        req.user,
        'CATALOG_RECONCILED',
        'SEARCH_INDEX',
        ES_INDEX,
        'SUCCESS',
        `Reconciled catalog (dry-run: ${dryRun}): scanned ${mapped.scannedCount}, repaired ${mapped.repairedCount}`,
        null,
        mapped
      );

      return res.status(200).json(mapped);
    } catch (err) {
      return res.status(500).json({ error: 'RECONCILE_FAILED', message: err.message });
    } finally {
      await releaseOperationLock('catalog_reconcile', operationId, {
        stateDir: effectiveStateDir,
        jobsCollection
      });
    }
  };

  router.post('/reconcile', requireRoles(['ADMIN']), reconcileHandler);
  router.post('/ingestion/reconcile', requireRoles(['ADMIN']), reconcileHandler);

  // -------------------------------------------------------------
  // 16. POST /reindex - Zero-downtime reindex (ADMIN only)
  // -------------------------------------------------------------
  const reindexHandler = async (req, res) => {
    if (!esClient || !jobsCollection) {
      return res.status(503).json({ error: 'UNAVAILABLE', message: 'Both MongoDB and Elasticsearch required for reindex' });
    }

    const operationId = `reindex_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const lockResult = await acquireOperationLock('search_reindex', operationId, 600000, {
      stateDir: effectiveStateDir,
      jobsCollection
    });

    if (!lockResult.acquired) {
      return res.status(409).json({
        error: 'OPERATION_IN_PROGRESS',
        message: 'An index rebuild is already running.'
      });
    }

    const startTime = Date.now();

    try {
      const result = await rebuildIndex(jobsCollection, esClient);
      const durationMs = Date.now() - startTime;

      const formattedResult = {
        operationId,
        status: 'COMPLETED',
        sourceIndex: ES_INDEX,
        targetIndex: result.targetIndex,
        alias: ES_INDEX,
        documentsIndexed: result.activeJobsProjected,
        durationMs,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        success: true
      };

      await recordAudit(
        req.user,
        'INDEX_REBUILD',
        'SEARCH_INDEX',
        result.targetIndex,
        'SUCCESS',
        `Rebuilt index ${result.targetIndex} with alias swap; ${result.activeJobsProjected} docs`,
        null,
        formattedResult
      );

      return res.status(200).json(formattedResult);
    } catch (err) {
      return res.status(500).json({ error: 'REINDEX_FAILED', message: err.message });
    } finally {
      await releaseOperationLock('search_reindex', operationId, {
        stateDir: effectiveStateDir,
        jobsCollection
      });
    }
  };

  router.post('/reindex', requireRoles(['ADMIN']), reindexHandler);
  router.post('/ingestion/reindex', requireRoles(['ADMIN']), reindexHandler);

  // -------------------------------------------------------------
  // 17. GET /audit - Immutable operator audit log
  // -------------------------------------------------------------
  router.get('/audit', requireRoles(['ADMIN', 'OPERATOR', 'READ_ONLY']), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const results = [];

    // 1. Read from MongoDB audit collection if available
    if (auditCollection) {
      try {
        const logs = await auditCollection.find({}).sort({ timestamp: -1, _id: -1 }).limit(limit).toArray();
        results.push(...logs);
      } catch (err) {
        console.warn('Failed to read from auditCollection:', err.message);
      }
    }

    // 2. If collection returned fewer or is not configured, supplement from durable file log
    if (results.length < limit) {
      try {
        const auditFilePath = path.join(effectiveStateDir, 'audit', 'operator_audit.jsonl');
        if (fs.existsSync(auditFilePath)) {
          const content = fs.readFileSync(auditFilePath, 'utf8');
          const lines = content.trim().split('\n').filter(Boolean);
          const fileEntries = lines.map(l => {
            try { return JSON.parse(l); } catch { return null; }
          }).filter(Boolean);

          const existingIds = new Set(results.map(r => r.id));
          for (let i = fileEntries.length - 1; i >= 0 && results.length < limit; i--) {
            const entry = fileEntries[i];
            if (!existingIds.has(entry.id)) {
              results.push(entry);
              existingIds.add(entry.id);
            }
          }
        }
      } catch {}
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return res.status(200).json(results.slice(0, limit));
  });

  return router;
}

module.exports = {
  createAdminRouter,
  safeCompare,
  acquireOperationLock,
  releaseOperationLock
};
