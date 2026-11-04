// service-ingestion/test/admin-router.test.js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const http = require('http');
const request = require('supertest');
const { createIngestionApp } = require('../index');

describe('service-ingestion Admin Router & Privileged Operations', () => {
  let app;
  let mockJobs;
  let mockDeadLetters;
  let mockAuditLogs;
  let mockSources;
  let mockCrawlRuns;

  const validKey = 'seekers-internal-admin-p12';

  // Helper to create synthetic JWT token with specific role
  function createRoleToken(role, uid = 'usr_test_123', email = 'test@seekers.internal', { exp, iss, aud, secret = validKey, alg = 'HS256' } = {}) {
    const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      uid,
      sub: uid,
      email,
      role,
      admin: role === 'ADMIN',
      exp: exp !== undefined ? exp : now + 3600,
      iss: iss || 'seekers-auth',
      aud: aud || 'seekers-admin'
    })).toString('base64url');

    if (alg === 'none') {
      return `${header}.${payload}.sig`;
    }

    const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${sig}`;
  }

  beforeEach(() => {
    mockJobs = [
      {
        id: 'e1a2b3c4-1111-4000-8000-000000000001',
        title: 'Senior Distributed Systems Engineer (Go/Kafka)',
        company: 'bKash Limited',
        location: 'Kawran Bazar, Dhaka',
        source: 'greenhouse-feed',
        canonical_url: 'https://boards.greenhouse.io/bkash/jobs/4011223',
        status: 'ACTIVE',
        revision: 1,
        projection_status: 'INDEXED',
        created_at: new Date('2026-10-28T10:00:00Z'),
        updated_at: new Date('2026-10-28T10:00:00Z'),
        provenance: {
          duplicate_count: 1,
          duplicate_hashes: ['hash_bkash_01']
        }
      },
      {
        id: 'e1a2b3c4-2222-4000-8000-000000000002',
        title: 'Lead Architect',
        company: 'Pathao',
        location: 'Gulshan, Dhaka',
        source: 'lever-feed',
        canonical_url: 'https://jobs.lever.co/pathao/arch-1',
        status: 'FLAGGED',
        revision: 2,
        projection_status: 'INDEXED',
        created_at: new Date('2026-10-28T11:00:00Z'),
        updated_at: new Date('2026-10-28T11:00:00Z')
      }
    ];

    const testUrl = 'https://pathao.com/careers/go-dev-1';
    const testUrlHash = crypto.createHash('sha256').update(testUrl).digest('hex');

    mockDeadLetters = [
      {
        id: 'dlq_poison_01',
        event_type: 'job.collected.v1',
        quarantined_at: new Date('2026-10-29T12:00:00Z'),
        errors: ['Invalid salary'],
        status: 'QUARANTINED',
        retry_count: 0,
        raw_payload: {
          event_id: '11111111-2222-4000-8000-333333333333',
          event_type: 'job.collected.v1',
          schema_version: '1.0.0',
          producer: 'service-scraper',
          timestamp: '2026-10-29T12:00:00Z',
          correlation_id: '44444444-5555-4000-8000-666666666666',
          payload: {
            source: 'pathao-careers',
            source_job_id: 'pathao_go_1',
            url: testUrl,
            source_url_hash: testUrlHash,
            title: 'Valid Go Engineer',
            company: 'Pathao',
            location: 'Dhaka',
            description: 'Valid description text with enough length for testing.',
            collected_at: '2026-10-29T12:00:00Z'
          }
        }
      }
    ];

    mockAuditLogs = [];
    mockSources = [];
    mockCrawlRuns = [];

    const jobsCollection = {
      countDocuments: async (filter = {}) => {
        if (filter.status) return mockJobs.filter(j => j.status === filter.status).length;
        if (filter.projection_status) return mockJobs.filter(j => j.projection_status === filter.projection_status).length;
        if (filter.created_at?.$gte) {
          const gte = new Date(filter.created_at.$gte).getTime();
          return mockJobs.filter(j => new Date(j.created_at).getTime() >= gte).length;
        }
        return mockJobs.length;
      },
      findOne: async (filter) => {
        if (filter.id) return mockJobs.find(j => j.id === filter.id) || null;
        return null;
      },
      find: (filter = {}) => ({
        sort: () => ({
          skip: (skip) => ({
            limit: (limit) => ({
              toArray: async () => {
                let list = [...mockJobs];
                if (filter.status) list = list.filter(j => j.status === filter.status);
                if (filter.source) list = list.filter(j => j.source === filter.source);
                return list.slice(skip, skip + limit);
              }
            })
          })
        })
      }),
      updateOne: async (filter, update) => {
        const item = mockJobs.find(j => j.id === filter.id);
        if (!item) return { matchedCount: 0, modifiedCount: 0 };
        if (filter.revision !== undefined && item.revision !== filter.revision) {
          return { matchedCount: 0, modifiedCount: 0 }; // Revision conflict
        }
        if (update.$set) {
          Object.assign(item, update.$set);
        }
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            item[k] = (item[k] || 0) + v;
          }
        }
        return { matchedCount: 1, modifiedCount: 1 };
      }
    };

    const deadLettersCollection = {
      countDocuments: async (filter = {}) => {
        if (filter.status) return mockDeadLetters.filter(d => d.status === filter.status).length;
        return mockDeadLetters.length;
      },
      find: (filter = {}) => ({
        sort: () => ({
          limit: (n) => ({
            toArray: async () => mockDeadLetters.slice(0, n)
          })
        })
      }),
      findOne: async (filter) => mockDeadLetters.find(d => d.id === filter.id) || null,
      updateOne: async (filter, update) => {
        const item = mockDeadLetters.find(d => d.id === filter.id);
        if (item) {
          if (update.$set) Object.assign(item, update.$set);
          if (update.$inc?.retry_count) item.retry_count = (item.retry_count || 0) + update.$inc.retry_count;
        }
        return { modifiedCount: 1 };
      }
    };

    const auditCollection = {
      insertOne: async (entry) => {
        mockAuditLogs.push(entry);
        return { insertedId: entry.id };
      },
      find: () => ({
        sort: () => ({
          limit: (n) => ({
            toArray: async () => mockAuditLogs.slice(0, n)
          })
        })
      })
    };

    const sourcesCollection = {
      findOne: async (filter) => mockSources.find(s => s.id === filter.id) || null,
      updateOne: async (filter, update, opts = {}) => {
        let item = mockSources.find(s => s.id === filter.id);
        if (!item && opts.upsert) {
          item = { id: filter.id };
          mockSources.push(item);
        }
        if (item && update.$set) {
          Object.assign(item, update.$set);
        }
        return { matchedCount: 1, modifiedCount: 1 };
      }
    };

    const crawlRunsCollection = {
      insertOne: async (run) => {
        mockCrawlRuns.push(run);
        return { insertedId: run.id };
      },
      find: () => ({
        sort: () => ({
          limit: (n) => ({
            toArray: async () => mockCrawlRuns.slice(0, n)
          })
        })
      })
    };

    app = createIngestionApp(
      jobsCollection,
      null,
      deadLettersCollection,
      auditCollection,
      sourcesCollection,
      crawlRunsCollection
    );
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/admin/ingestion/status');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED_ACCESS');
  });

  it('rejects candidate accounts with 403 Forbidden', async () => {
    const candidateToken = createRoleToken('CANDIDATE', 'usr_cand_99');
    const res = await request(app)
      .get('/api/v1/admin/status')
      .set('Authorization', `Bearer ${candidateToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'FORBIDDEN_CANDIDATE');
  });

  it('rejects unsigned tokens (alg: none) with 401 Unauthorized', async () => {
    const unsignedToken = createRoleToken('ADMIN', 'usr_evil', 'evil@seekers.internal', { alg: 'none' });
    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${unsignedToken}`);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED_ACCESS');
    assert.ok(res.body.message.includes('alg: none'));
  });

  it('rejects expired tokens with 401 Unauthorized', async () => {
    const expiredToken = createRoleToken('ADMIN', 'usr_exp', 'exp@seekers.internal', {
      exp: Math.floor(Date.now() / 1000) - 60
    });
    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'TOKEN_EXPIRED');
  });

  it('rejects tokens with invalid issuer', async () => {
    const invalidIssToken = createRoleToken('ADMIN', 'usr_iss', 'iss@seekers.internal', {
      iss: 'malicious-issuer.com'
    });
    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${invalidIssToken}`);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'INVALID_ISSUER');
  });

  it('rejects tokens with invalid audience', async () => {
    const invalidAudToken = createRoleToken('ADMIN', 'usr_aud', 'aud@seekers.internal', {
      aud: 'wrong-audience-portal'
    });
    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${invalidAudToken}`);

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'INVALID_AUDIENCE');
  });

  it('accepts authenticated requests with x-admin-key header', async () => {
    const res = await request(app)
      .get('/api/v1/admin/ingestion/status')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalJobs, 2);
    assert.strictEqual(res.body.activeJobs, 1);
    assert.strictEqual(res.body.deadLetters, 1);
  });

  it('GET /auth/me returns operator principal and role', async () => {
    const token = createRoleToken('OPERATOR', 'usr_triage_1', 'triage@seekers.internal');
    const res = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, 'usr_triage_1');
    assert.strictEqual(res.body.role, 'OPERATOR');
  });

  it('READ_ONLY role cannot mutate listings or sources', async () => {
    const readOnlyToken = createRoleToken('READ_ONLY');
    const res = await request(app)
      .patch('/api/v1/admin/jobs/e1a2b3c4-1111-4000-8000-000000000001/moderate')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ action: 'FLAG', reason: 'Attempt from reader' });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'INSUFFICIENT_ROLE_PERMISSIONS');
  });

  it('OPERATOR role can moderate listings but cannot trigger index rebuild', async () => {
    const operatorToken = createRoleToken('OPERATOR');

    // Can moderate
    const modRes = await request(app)
      .patch('/api/v1/admin/jobs/e1a2b3c4-1111-4000-8000-000000000001/moderate')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ action: 'FLAG', reason: 'Flagged by operator' });

    assert.strictEqual(modRes.status, 200);
    assert.strictEqual(modRes.body.status, 'FLAGGED');

    // Cannot rebuild index (ADMIN only)
    const reindexRes = await request(app)
      .post('/api/v1/admin/reindex')
      .set('Authorization', `Bearer ${operatorToken}`);

    assert.strictEqual(reindexRes.status, 403);
    assert.strictEqual(reindexRes.body.error, 'INSUFFICIENT_ROLE_PERMISSIONS');
  });

  it('GET /status reports truthful telemetry without fake floors', async () => {
    const res = await request(app)
      .get('/api/v1/admin/status')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    // Since mockJobs were created in the past (2026-10-28), hourlyThroughput must be 0, not fake 120!
    assert.strictEqual(res.body.throughputHourly, 0);
    // Latency and lag must be null when unmeasured, not fake 18 or 14!
    assert.strictEqual(res.body.avgLatencyMs, null);
    assert.strictEqual(res.body.kafkaLagMs, null);
  });

  it('GET /sources returns registered sources with legal provenance', async () => {
    const res = await request(app)
      .get('/api/v1/admin/sources')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    const gh = res.body.find(s => s.id === 'greenhouse-feed');
    assert.ok(gh);
    assert.strictEqual(gh.status, 'HEALTHY');
    assert.ok(gh.approvedHosts.includes('boards-api.greenhouse.io'));
    assert.ok(gh.permissionRef);
  });

  it('ADMIN can pause and resume sources with audit trail', async () => {
    // Pause
    const pauseRes = await request(app)
      .put('/api/v1/admin/sources/greenhouse-feed/pause')
      .set('x-admin-key', validKey);

    assert.strictEqual(pauseRes.status, 200);
    assert.strictEqual(pauseRes.body.status, 'PAUSED');

    // Verify audit
    const pauseAudit = mockAuditLogs.find(a => a.action === 'SOURCE_PAUSED');
    assert.ok(pauseAudit);
    assert.strictEqual(pauseAudit.targetId, 'greenhouse-feed');

    // Resume
    const resumeRes = await request(app)
      .put('/api/v1/admin/sources/greenhouse-feed/resume')
      .set('x-admin-key', validKey);

    assert.strictEqual(resumeRes.status, 200);
    assert.strictEqual(resumeRes.body.status, 'HEALTHY');
  });

  it('POST /sources/:id/crawl returns 503 when Go collector is offline', async () => {
    const res = await request(app)
      .post('/api/v1/admin/sources/greenhouse-feed/crawl')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.error, 'COLLECTOR_UNAVAILABLE');
    assert.strictEqual(mockCrawlRuns.length, 1);
    assert.strictEqual(mockCrawlRuns[0].status, 'FAILED');
  });

  it('POST /sources/:id/crawl rejects crawl on paused source with 400', async () => {
    // Pause source first
    await request(app)
      .put('/api/v1/admin/sources/greenhouse-feed/pause')
      .set('x-admin-key', validKey);

    const res = await request(app)
      .post('/api/v1/admin/sources/greenhouse-feed/crawl')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'SOURCE_PAUSED');

    // Unpause for clean test cleanup
    await request(app)
      .put('/api/v1/admin/sources/greenhouse-feed/resume')
      .set('x-admin-key', validKey);
  });

  it('POST /sources/:id/crawl routes to Go collector when available', async () => {
    // Spin up lightweight mock collector server
    const mockCollectorServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'crawl_real_mock_123',
        sourceId: 'greenhouse-feed',
        itemsCollected: 7,
        itemsRejected: 0,
        status: 'SUCCESS'
      }));
    });

    await new Promise(resolve => mockCollectorServer.listen(0, resolve));
    const port = mockCollectorServer.address().port;
    const origCollectorUrl = process.env.COLLECTOR_URL;
    process.env.COLLECTOR_URL = `http://127.0.0.1:${port}`;

    try {
      const res = await request(app)
        .post('/api/v1/admin/sources/greenhouse-feed/crawl')
        .set('x-admin-key', validKey);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'SUCCESS');
      assert.strictEqual(res.body.itemsCollected, 7);
      assert.ok(mockCrawlRuns.some(r => r.status === 'SUCCESS' && r.itemsCollected === 7));
    } finally {
      process.env.COLLECTOR_URL = origCollectorUrl;
      await new Promise(resolve => mockCollectorServer.close(resolve));
    }
  });

  it('GET /jobs returns privileged catalog search across ALL statuses', async () => {
    const res = await request(app)
      .get('/api/v1/admin/jobs?status=ALL')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total_count, 2);
    assert.strictEqual(res.body.items.length, 2);
  });

  it('PATCH /jobs/:id/moderate advances revision and sets projection_status PENDING', async () => {
    const jobId = 'e1a2b3c4-1111-4000-8000-000000000001';
    const res = await request(app)
      .patch(`/api/v1/admin/jobs/${jobId}/moderate`)
      .set('x-admin-key', validKey)
      .send({ action: 'HIDE', reason: 'Violates posting guidelines' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'HIDDEN');
    assert.strictEqual(res.body.revision, 2);
    assert.strictEqual(res.body.projection_status, 'PENDING');

    const job = mockJobs.find(j => j.id === jobId);
    assert.strictEqual(job.status, 'HIDDEN');
    assert.strictEqual(job.revision, 2);
    assert.strictEqual(job.projection_status, 'PENDING');
  });

  it('GET /dead-letters returns list of quarantined messages with resilient field mapping', async () => {
    const res = await request(app)
      .get('/api/v1/admin/ingestion/dead-letters')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, 'dlq_poison_01');
    assert.ok(res.body[0].quarantinedAt);
  });

  it('POST /dead-letters/:id/replay re-validates and resolves poison event', async () => {
    const res = await request(app)
      .post('/api/v1/admin/ingestion/dead-letters/dlq_poison_01/replay')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.canonicalJobId);

    const dlq = mockDeadLetters.find(d => d.id === 'dlq_poison_01');
    assert.strictEqual(dlq.status, 'RESOLVED');

    assert.ok(mockAuditLogs.some(a => a.action === 'DEAD_LETTER_REPLAYED'));
  });

  it('POST /dead-letters/:id/replay returns 409 when item already resolved (idempotency guard)', async () => {
    // Replay first time
    await request(app)
      .post('/api/v1/admin/ingestion/dead-letters/dlq_poison_01/replay')
      .set('x-admin-key', validKey);

    // Replay second time
    const res = await request(app)
      .post('/api/v1/admin/ingestion/dead-letters/dlq_poison_01/replay')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'ALREADY_RESOLVED');
  });

  it('GET /queues returns truthful Kafka and outbox projection metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/queues')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.topic, 'job.collected.v1');
    assert.strictEqual(res.body.partitionCount, 3);
    assert.ok(res.body.projectionOutbox);
  });

  it('fails closed in production mode when default key is used', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.INGESTION_ADMIN_KEY;

    try {
      const res = await request(app)
        .get('/api/v1/admin/ingestion/status')
        .set('x-admin-key', 'seekers-internal-admin-p12');

      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.error, 'CONFIGURATION_ERROR');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('strictly rejects published development tokens in production mode', async () => {
    const origEnv = process.env.NODE_ENV;
    const origKey = process.env.INGESTION_ADMIN_KEY;
    process.env.NODE_ENV = 'production';
    process.env.INGESTION_ADMIN_KEY = 'super-strong-production-key-secret-12345';

    try {
      // Rejection of dev tokens
      for (const devToken of ['admin_secret_token', 'operator_secret_token', 'readonly_secret_token', 'seekers-internal-admin-p12']) {
        const res = await request(app)
          .get('/api/v1/admin/status')
          .set('x-admin-key', devToken);

        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.error, 'UNAUTHORIZED_ACCESS');
      }

      // Acceptance of configured production key
      const goodRes = await request(app)
        .get('/api/v1/admin/status')
        .set('x-admin-key', 'super-strong-production-key-secret-12345');

      assert.strictEqual(goodRes.status, 200);
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.INGESTION_ADMIN_KEY = origKey;
    }
  });
});
