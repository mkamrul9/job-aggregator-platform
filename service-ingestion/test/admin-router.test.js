// service-ingestion/test/admin-router.test.js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createIngestionApp } = require('../index');

describe('service-ingestion Admin Router & Privileged Operations', () => {
  let app;
  let mockJobs;
  let mockDeadLetters;
  let mockAuditLogs;

  const validKey = 'seekers-internal-admin-p12';

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
        created_at: new Date('2026-10-28T10:00:00Z'),
        updated_at: new Date('2026-10-28T10:00:00Z'),
        provenance: {
          duplicate_count: 1,
          duplicate_hashes: ['hash_bkash_01']
        }
      }
    ];

    const testUrl = 'https://pathao.com/careers/go-dev-1';
    const testUrlHash = require('crypto').createHash('sha256').update(testUrl).digest('hex');

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

    const jobsCollection = {
      countDocuments: async (filter = {}) => {
        if (filter.status) return mockJobs.filter(j => j.status === filter.status).length;
        if (filter.projection_status) return 0;
        return mockJobs.length;
      },
      findOne: async (filter) => mockJobs.find(j => j.id === filter.id) || null,
      updateOne: async (filter, update) => {
        const item = mockJobs.find(j => j.id === filter.id);
        if (item && update.$set) {
          Object.assign(item, update.$set);
        }
        return { modifiedCount: 1 };
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

    app = createIngestionApp(jobsCollection, null, deadLettersCollection, auditCollection);
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/admin/ingestion/status');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED_ACCESS');
  });

  it('accepts authenticated requests with x-admin-key header', async () => {
    const res = await request(app)
      .get('/api/v1/admin/ingestion/status')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.totalJobs, 1);
    assert.strictEqual(res.body.activeJobs, 1);
    assert.strictEqual(res.body.deadLetters, 1);
  });

  it('GET /dead-letters returns list of quarantined messages', async () => {
    const res = await request(app)
      .get('/api/v1/admin/ingestion/dead-letters')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, 'dlq_poison_01');
  });

  it('POST /dead-letters/:id/replay re-validates and resolves poison event', async () => {
    const res = await request(app)
      .post('/api/v1/admin/ingestion/dead-letters/dlq_poison_01/replay')
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.canonicalJobId);

    // Dead letter marked RESOLVED
    const dlq = mockDeadLetters.find(d => d.id === 'dlq_poison_01');
    assert.strictEqual(dlq.status, 'RESOLVED');

    // Audit log recorded
    assert.strictEqual(mockAuditLogs.length, 1);
    assert.strictEqual(mockAuditLogs[0].action, 'DEAD_LETTER_REPLAYED');
  });

  it('PATCH /jobs/:id/moderate updates listing status and records audit', async () => {
    const jobId = 'e1a2b3c4-1111-4000-8000-000000000001';
    const res = await request(app)
      .patch(`/api/v1/admin/jobs/${jobId}/moderate`)
      .set('x-admin-key', validKey)
      .send({ action: 'FLAG', reason: 'Misleading compensation' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'FLAGGED');

    const job = mockJobs.find(j => j.id === jobId);
    assert.strictEqual(job.status, 'FLAGGED');

    assert.strictEqual(mockAuditLogs.length, 1);
    assert.strictEqual(mockAuditLogs[0].action, 'JOB_FLAG');
    assert.strictEqual(mockAuditLogs[0].targetId, jobId);
  });

  it('GET /jobs/:id/provenance returns deduplication and provenance metadata', async () => {
    const jobId = 'e1a2b3c4-1111-4000-8000-000000000001';
    const res = await request(app)
      .get(`/api/v1/admin/jobs/${jobId}/provenance`)
      .set('x-admin-key', validKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, jobId);
    assert.strictEqual(res.body.duplicate_count, 1);
    assert.deepStrictEqual(res.body.duplicate_hashes, ['hash_bkash_01']);
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
});
