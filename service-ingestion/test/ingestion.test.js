// service-ingestion/test/ingestion.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const {
  createIngestionApp,
  escapeRegex,
  processMessage,
} = require('../index');
const {
  normalizeCanonicalUrl,
  generateDeterministicUuid,
  validateOutboundUrl,
  sanitizeDescription,
  toCanonicalJob,
  isListingAvailable,
} = require('../src/models/job');
const { validateSearchParams, encodeCursor } = require('../src/search/query-validator');

describe('service-ingestion unit tests', () => {
  describe('escapeRegex', () => {
    it('should escape all regex special characters', () => {
      const input = 'react.js (senior) [remote] $100k+?';
      const escaped = escapeRegex(input);
      assert.strictEqual(
        escaped,
        'react\\.js \\(senior\\) \\[remote\\] \\$100k\\+\\?'
      );
    });

    it('should leave alphanumeric text unchanged', () => {
      assert.strictEqual(escapeRegex('Senior Developer 123'), 'Senior Developer 123');
    });
  });

  describe('canonical job model and normalization', () => {
    it('normalizes canonical URLs by stripping tracking parameters and standardizing paths', () => {
      const raw = 'https://Example.COM/jobs/engineering/?utm_source=linkedin&utm_campaign=spring&id=123#frag';
      const normalized = normalizeCanonicalUrl(raw);
      assert.strictEqual(normalized, 'https://example.com/jobs/engineering?id=123#frag');
    });

    it('generates stable, deterministic UUIDs from canonical URLs', () => {
      const url1 = 'https://example.com/jobs/senior-go-engineer';
      const id1 = generateDeterministicUuid(url1);
      const id2 = generateDeterministicUuid(url1);
      assert.strictEqual(id1, id2);
      assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('sanitizes descriptions by stripping scripts and harmful HTML tags', () => {
      const dirty = '<p>Hello <script>alert("xss")</script>world! <style>body{}</style></p>';
      const clean = sanitizeDescription(dirty);
      assert.strictEqual(clean, 'Hello world!');
    });

    it('converts legacy documents to canonical schema with stable defaults', () => {
      const legacy = {
        title: 'Python Backend Dev',
        company: 'Dhaka Tech',
        url: 'https://dhakatech.com/jobs/1',
        raw_description: 'We need Python and Django experts.',
        scraped_at: '2026-10-27T10:00:00.000Z',
      };
      const canonical = toCanonicalJob(legacy);
      assert.strictEqual(canonical.title, 'Python Backend Dev');
      assert.strictEqual(canonical.canonical_url, 'https://dhakatech.com/jobs/1');
      assert.strictEqual(canonical.description, 'We need Python and Django experts.');
      assert.strictEqual(canonical.status, 'ACTIVE');
      assert.strictEqual(canonical.remote_eligibility, 'UNSPECIFIED');
      assert.strictEqual(canonical.job_type, 'UNSPECIFIED');
      assert.strictEqual(canonical.seniority, 'UNSPECIFIED');
    });

    it('converts JobCollectedV1 payload with source_job_id and collected_at to canonical schema', () => {
      const eventPayload = {
        source: 'greenhouse-feed',
        source_job_id: 'gh-49120',
        url: 'https://boards.greenhouse.io/corp/jobs/gh-49120',
        source_url_hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        title: 'Platform Infrastructure Engineer',
        company: 'Corp Inc',
        location: 'Dhaka',
        description: 'Building reliable distributed systems at scale.',
        collected_at: '2026-10-28T15:00:00.000Z',
      };
      const canonical = toCanonicalJob(eventPayload);
      assert.strictEqual(canonical.source_id, 'gh-49120');
      assert.strictEqual(canonical.source, 'greenhouse-feed');
      assert.strictEqual(canonical.source_url_hash, eventPayload.source_url_hash);
      assert.strictEqual(new Date(canonical.published_at).toISOString(), '2026-10-28T15:00:00.000Z');
    });
  });

  describe('outbound URL security validation', () => {
    it('accepts valid public https URLs', () => {
      const res = validateOutboundUrl('https://boards.greenhouse.io/company/jobs/123');
      assert.strictEqual(res.valid, true);
    });

    it('rejects URLs with credentials', () => {
      const res = validateOutboundUrl('https://user:pass@evil.com/job');
      assert.strictEqual(res.valid, false);
      assert.match(res.reason, /credentials/i);
    });

    it('rejects unsupported protocols like javascript: and data:', () => {
      assert.strictEqual(validateOutboundUrl('javascript:alert(1)').valid, false);
      assert.strictEqual(validateOutboundUrl('data:text/html,bad').valid, false);
      assert.strictEqual(validateOutboundUrl('file:///etc/passwd').valid, false);
    });

    it('rejects loopback and private IP addresses by default', () => {
      assert.strictEqual(validateOutboundUrl('http://127.0.0.1/admin').valid, false);
      assert.strictEqual(validateOutboundUrl('http://localhost:8080/exploit').valid, false);
      assert.strictEqual(validateOutboundUrl('http://192.168.1.1/router').valid, false);
      assert.strictEqual(validateOutboundUrl('http://10.0.0.5/internal').valid, false);
    });

    it('accepts innocent domains containing "data" such as metadata.example.com', () => {
      const res = validateOutboundUrl('https://metadata.example.com/jobs/1');
      assert.strictEqual(res.valid, true);
    });

    it('rejects IPv6 loopback, link-local, and ULA addresses', () => {
      assert.strictEqual(validateOutboundUrl('http://[::1]:8080/admin').valid, false);
      assert.strictEqual(validateOutboundUrl('http://[fe80::1]/test').valid, false);
      assert.strictEqual(validateOutboundUrl('http://[fd00::1]/internal').valid, false);
      assert.strictEqual(validateOutboundUrl('http://internal/jobs').valid, false);
    });
  });

  describe('isListingAvailable', () => {
    it('considers ACTIVE listing with no expires_at available', () => {
      assert.strictEqual(isListingAvailable({ status: 'ACTIVE' }), true);
    });

    it('considers ACTIVE listing with future expires_at available', () => {
      const future = new Date(Date.now() + 100000);
      assert.strictEqual(isListingAvailable({ status: 'ACTIVE', expires_at: future }), true);
    });

    it('considers ACTIVE listing with past expires_at unavailable', () => {
      const past = new Date(Date.now() - 100000);
      assert.strictEqual(isListingAvailable({ status: 'ACTIVE', expires_at: past }), false);
    });

    it('considers EXPIRED and FLAGGED listings unavailable', () => {
      assert.strictEqual(isListingAvailable({ status: 'EXPIRED' }), false);
      assert.strictEqual(isListingAvailable({ status: 'FLAGGED' }), false);
    });
  });

  describe('search query validation', () => {
    it('rejects negative or oversized limits with 400 Bad Request', () => {
      const resNegative = validateSearchParams({ limit: '-5' });
      assert.strictEqual(resNegative.valid, false);
      assert.strictEqual(resNegative.error.status, 400);

      const resOversized = validateSearchParams({ limit: '500' });
      assert.strictEqual(resOversized.valid, false);
      assert.strictEqual(resOversized.error.status, 400);
    });

    it('rejects non-integer limits with 400 Bad Request', () => {
      for (const badLimit of ['1.5', '2junk', '1e2', 'NaN', 'null']) {
        const res = validateSearchParams({ limit: badLimit });
        assert.strictEqual(res.valid, false, `Expected limit "${badLimit}" to be rejected`);
        assert.strictEqual(res.error.status, 400);
      }
    });

    it('rejects malformed or mismatched cursors', () => {
      // Empty JSON object cursor
      const emptyCursor = Buffer.from('{}').toString('base64url');
      const resEmpty = validateSearchParams({ cursor: emptyCursor });
      assert.strictEqual(resEmpty.valid, false);

      // Cursor with sort mismatch
      const cursorData = encodeCursor({ v: 1, sort: 'salary_desc', q: '', sortValues: [1000, 'id'] });
      const resMismatch = validateSearchParams({ cursor: cursorData, sort: 'date_desc' });
      assert.strictEqual(resMismatch.valid, false);
      assert.match(resMismatch.error.detail, /Cursor sort/);
    });

    it('rejects non-scalar query parameter types', () => {
      const resArray = validateSearchParams({ limit: ['10', '20'] });
      assert.strictEqual(resArray.valid, false);
      assert.strictEqual(resArray.error.status, 400);
    });

    it('rejects overlong queries and invalid enums', () => {
      const resLongQ = validateSearchParams({ q: 'a'.repeat(105) });
      assert.strictEqual(resLongQ.valid, false);

      const resBadEnum = validateSearchParams({ remote_eligibility: 'SOMEWHERE_ELSE' });
      assert.strictEqual(resBadEnum.valid, false);

      const resBadCurrency = validateSearchParams({ currency: 'EUR' });
      assert.strictEqual(resBadCurrency.valid, false);

      const resBadSort = validateSearchParams({ sort: 'unsupported_sort' });
      assert.strictEqual(resBadSort.valid, false);
    });

    it('accepts valid contracted query parameters', () => {
      const res = validateSearchParams({
        q: 'Golang',
        location: 'Dhaka',
        remote_eligibility: 'FULLY_REMOTE',
        job_type: 'FULL_TIME',
        seniority: 'SENIOR',
        currency: 'BDT',
        min_salary: '100000',
        sort: 'salary_desc',
        limit: '25',
      });
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.params.q, 'Golang');
      assert.strictEqual(res.params.limit, 25);
      assert.strictEqual(res.params.min_salary, 100000);
    });
  });

  describe('createIngestionApp HTTP endpoints', () => {
    it('GET /health returns 200 and healthy status', async () => {
      const app = createIngestionApp();
      const res = await request(app).get('/health');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, { status: 'Ingestion Service is running.' });
    });

    it('GET /api/jobs returns 503 when collection is unavailable', async () => {
      const app = createIngestionApp(null);
      const res = await request(app).get('/api/jobs');
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.error, 'Database collection not available');
    });

    it('GET /api/v1/jobs rejects oversized limit with 400 RFC 7807', async () => {
      const mockCollection = {};
      const app = createIngestionApp(mockCollection);
      const res = await request(app).get('/api/v1/jobs?limit=500');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 400);
      assert.match(res.body.detail, /limit/i);
    });

    it('GET /api/v1/jobs/:id returns 404 for non-existent job UUID', async () => {
      const mockCollection = {
        findOne: async () => null,
      };
      const app = createIngestionApp(mockCollection);
      const res = await request(app).get('/api/v1/jobs/a0000000-0000-4000-8000-000000000001');
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.status, 404);
      assert.strictEqual(res.body.title, 'Not Found');
    });

    it('GET /api/v1/jobs/:id returns 200 and JobDetail for existing job', async () => {
      const mockJob = {
        id: 'b0000000-0000-4000-8000-000000000002',
        canonical_url: 'https://techcorp.com/jobs/lead-architect',
        title: 'Lead Architect',
        company: 'TechCorp',
        location: 'Dhaka',
        remote_eligibility: 'HYBRID',
        job_type: 'FULL_TIME',
        seniority: 'LEAD',
        skills: ['Architecture', 'Kubernetes'],
        description: 'Lead our distributed systems platform.',
        status: 'ACTIVE',
        published_at: new Date('2026-10-27T08:00:00.000Z'),
        ingested_at: new Date('2026-10-27T08:05:00.000Z'),
      };

      const mockCollection = {
        findOne: async ({ id }) => (id === mockJob.id ? mockJob : null),
      };

      const app = createIngestionApp(mockCollection);
      const res = await request(app).get(`/api/v1/jobs/${mockJob.id}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, mockJob.id);
      assert.strictEqual(res.body.title, 'Lead Architect');
      assert.strictEqual(res.body.canonical_url, mockJob.canonical_url);
    });

    it('GET /api/v1/jobs/:id/outbound returns 302 redirect for active job', async () => {
      const mockJob = {
        id: 'c0000000-0000-4000-8000-000000000003',
        canonical_url: 'https://careers.google.com/jobs/results/12345',
        title: 'Staff SRE',
        company: 'Google',
        status: 'ACTIVE',
      };

      const mockCollection = {
        findOne: async ({ id }) => (id === mockJob.id ? mockJob : null),
        updateOne: async () => {},
      };

      const app = createIngestionApp(mockCollection);
      const res = await request(app)
        .get(`/api/v1/jobs/${mockJob.id}/outbound`)
        .set('Accept', 'text/html');

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.location, mockJob.canonical_url);
    });

    it('GET /api/v1/jobs/:id/outbound returns 200 JSON destination_url when requested', async () => {
      const mockJob = {
        id: 'd0000000-0000-4000-8000-000000000004',
        canonical_url: 'https://jobs.netflix.com/jobs/98765',
        title: 'Senior Distributed Systems Engineer',
        company: 'Netflix',
        status: 'ACTIVE',
      };

      const mockCollection = {
        findOne: async ({ id }) => (id === mockJob.id ? mockJob : null),
        updateOne: async () => {},
      };

      const app = createIngestionApp(mockCollection);
      const res = await request(app)
        .get(`/api/v1/jobs/${mockJob.id}/outbound?format=json`)
        .set('Accept', 'application/json');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.destination_url, mockJob.canonical_url);
    });

    it('GET /api/v1/jobs/:id/outbound returns 404 if listing is EXPIRED', async () => {
      const mockJob = {
        id: 'e0000000-0000-4000-8000-000000000005',
        canonical_url: 'https://example.com/expired',
        title: 'Old Job',
        company: 'Old Corp',
        status: 'EXPIRED',
      };

      const mockCollection = {
        findOne: async ({ id }) => (id === mockJob.id ? mockJob : null),
      };

      const app = createIngestionApp(mockCollection);
      const res = await request(app).get(`/api/v1/jobs/${mockJob.id}/outbound`);
      assert.strictEqual(res.status, 404);
      assert.match(res.body.detail, /expired/i);
    });
  });

  describe('processMessage', () => {
    it('should return null if messageValue is empty', async () => {
      const result = await processMessage(null);
      assert.strictEqual(result, null);
    });

    it('should parse message, canonicalize, and dual-write to Mongo and Elasticsearch with stable UUID', async () => {
      let mongoUpdateArgs = null;
      let esIndexArgs = null;

      const mockCollection = {
        findOne: async () => null,
        updateOne: async (filter, update, options) => {
          mongoUpdateArgs = { filter, update, options };
        },
      };

      const mockEsClient = {
        index: async (params) => {
          esIndexArgs = params;
        },
      };

      const payload = {
        title: 'Backend Engineer',
        company: 'CloudCorp',
        url: 'https://example.com/job/123',
        raw_description: 'We are hiring a Go and Python developer.',
      };

      const messageValue = Buffer.from(JSON.stringify(payload));
      const processed = await processMessage(messageValue, {
        jobsCollection: mockCollection,
        esClient: mockEsClient,
      });

      assert.strictEqual(processed.title, 'Backend Engineer');
      assert.strictEqual(mongoUpdateArgs.filter.canonical_url, 'https://example.com/job/123');
      assert.strictEqual(mongoUpdateArgs.options.upsert, true);
      assert.strictEqual(esIndexArgs.index, 'jobs_index');
      assert.strictEqual(esIndexArgs.id, processed.id);
    });

    it('should tolerate Elasticsearch indexing failure gracefully', async () => {
      const mockCollection = {
        findOne: async () => null,
        updateOne: async () => {},
      };

      const mockEsClient = {
        index: async () => {
          throw new Error('Elasticsearch connection refused');
        },
      };

      const payload = {
        title: 'Staff Engineer',
        company: 'Resilient Co',
        url: 'https://example.com/job/456',
        raw_description: 'Resilient systems.',
      };

      const messageValue = Buffer.from(JSON.stringify(payload));
      const processed = await processMessage(messageValue, {
        jobsCollection: mockCollection,
        esClient: mockEsClient,
      });

      assert.strictEqual(processed.company, 'Resilient Co');
    });

    it('should quarantine poison/malformed event and return quarantined: true', async () => {
      let quarantinedDoc = null;
      const mockDeadLetters = {
        insertOne: async (doc) => {
          quarantinedDoc = doc;
        },
      };

      const poisonMessage = Buffer.from(JSON.stringify({ junk: 12345 }));
      const result = await processMessage(poisonMessage, {
        deadLettersCollection: mockDeadLetters,
      });

      assert.strictEqual(result.quarantined, true);
      assert.ok(quarantinedDoc !== null);
      assert.strictEqual(quarantinedDoc.status, 'QUARANTINED');
      assert.ok(quarantinedDoc.errors.length > 0);
    });
  });

  describe('event validation and dead letter handling', () => {
    const {
      validateEnvelope,
      validateJobCollectedPayload,
      validateIncomingEvent,
    } = require('../src/events/validator');
    const { quarantineDeadLetter } = require('../src/catalog/db');

    it('validates a conformant SeekersEventEnvelope', () => {
      const validEnvelope = {
        event_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        event_type: 'job.collected.v1',
        schema_version: '1.0.0',
        producer: 'service-scraper',
        timestamp: '2026-10-27T12:00:00Z',
        correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        causation_id: null,
        payload: {
          source: 'bdjobs',
          source_job_id: '1198324',
          url: 'https://jobs.bdjobs.com/jobdetails.asp?id=1198324',
          source_url_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          title: 'Senior Backend Engineer (Go / Node)',
          company: 'Kona Software Lab',
          location: 'Dhaka, Bangladesh',
          description: 'Looking for a seasoned backend engineer with 4+ years of Go.',
          collected_at: '2026-10-27T12:00:00Z',
        },
      };

      const res = validateEnvelope(validEnvelope);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
    });

    it('rejects envelope with missing required fields or invalid UUID', () => {
      const invalidEnvelope = {
        event_id: 'not-a-uuid',
        event_type: 'bad-format',
        schema_version: 'abc',
        producer: 'unauthorized-service',
        timestamp: 'invalid-date',
      };

      const res = validateEnvelope(invalidEnvelope);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.length >= 4);
    });

    it('validates a conformant JobCollectedV1Payload', () => {
      const payload = {
        source: 'greenhouse-feed',
        source_job_id: '4829101',
        url: 'https://boards.greenhouse.io/pathao/jobs/4829101',
        source_url_hash: '60a678e6f28dca9bb73cdd7eba5e1f302c59c544468361c66a8b9e6855d24ceb',
        title: 'Senior Backend Engineer',
        company: 'Pathao',
        location: 'Dhaka, Bangladesh',
        description: 'Building distributed Go infrastructure.',
        collected_at: '2026-10-28T12:00:00Z',
      };

      const res = validateJobCollectedPayload(payload);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
    });

    it('rejects payload with invalid SHA256 or short description', () => {
      const invalid = {
        source: 'g',
        source_job_id: '',
        url: 'ftp://bad-scheme.com',
        source_url_hash: 'not-64-hex',
        title: 'T',
        company: '',
        location: 'L',
        description: 'Short',
        collected_at: 'not-a-date',
      };

      const res = validateJobCollectedPayload(invalid);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.length >= 5);
    });

    it('quarantines dead letters into collection with status QUARANTINED', async () => {
      let inserted = null;
      const mockCollection = {
        insertOne: async (doc) => {
          inserted = doc;
        },
      };

      const dl = await quarantineDeadLetter(mockCollection, '{"malformed": true}', ['Missing required fields']);
      assert.strictEqual(inserted.id, dl.id);
      assert.strictEqual(inserted.status, 'QUARANTINED');
      assert.strictEqual(inserted.retry_count, 0);
      assert.strictEqual(inserted.errors[0], 'Missing required fields');
    });
  });

  describe('canonical MongoDB persistence, idempotency, and revision tracking', () => {
    const { upsertJobDocument } = require('../src/catalog/db');

    it('preserves first_seen_at and bumps revision on content update', async () => {
      const initialFirstSeen = new Date('2026-10-01T00:00:00Z');
      const existingDoc = {
        _id: 'mongo-id-1',
        id: '2a44e5d7-1335-430c-8f1d-fa61a7a0b33c',
        canonical_url: 'https://example.com/jobs/dev-1',
        source_url_hash: 'abc123hash',
        title: 'Junior Developer',
        company: 'Startup Co',
        location: 'Dhaka',
        description: 'Initial job description.',
        status: 'ACTIVE',
        first_seen_at: initialFirstSeen,
        revision: 1,
        projection_status: 'INDEXED',
      };

      let updatedDoc = null;
      const mockCollection = {
        findOne: async () => existingDoc,
        updateOne: async (filter, update) => {
          updatedDoc = update;
        },
      };

      // Content has changed (Junior -> Senior Developer)
      const updatedInput = {
        source: 'greenhouse-feed',
        source_job_id: '123',
        url: 'https://example.com/jobs/dev-1',
        title: 'Senior Developer',
        company: 'Startup Co',
        location: 'Dhaka',
        description: 'Updated job description with more requirements.',
      };

      const result = await upsertJobDocument(mockCollection, updatedInput);

      assert.strictEqual(result.id, existingDoc.id);
      assert.strictEqual(result.first_seen_at, initialFirstSeen);
      assert.strictEqual(result.revision, 2);
      assert.strictEqual(result.is_updated, true);
      assert.strictEqual(result.projection_status, 'PENDING');
      assert.strictEqual(updatedDoc.$set.revision, 2);
      assert.strictEqual(updatedDoc.$set.projection_status, 'PENDING');
    });

    it('does not bump revision or dirty projection status on unchanged duplicate replay', async () => {
      const initialFirstSeen = new Date('2026-10-01T00:00:00Z');
      const existingDoc = {
        _id: 'mongo-id-2',
        id: '99887766-5544-3322-1100-aabbccddeeff',
        canonical_url: 'https://example.com/jobs/qa-1',
        source_url_hash: 'def456hash',
        title: 'QA Automation Engineer',
        company: 'QualityCorp',
        location: 'Dhaka',
        description: 'Standard test automation description.',
        status: 'ACTIVE',
        first_seen_at: initialFirstSeen,
        revision: 3,
        projection_status: 'INDEXED',
      };

      let updatedDoc = null;
      const mockCollection = {
        findOne: async () => existingDoc,
        updateOne: async (filter, update) => {
          updatedDoc = update;
        },
      };

      const duplicateInput = {
        source: 'greenhouse-feed',
        source_job_id: 'qa-1',
        url: 'https://example.com/jobs/qa-1',
        title: 'QA Automation Engineer',
        company: 'QualityCorp',
        location: 'Dhaka',
        description: 'Standard test automation description.',
      };

      const result = await upsertJobDocument(mockCollection, duplicateInput);

      assert.strictEqual(result.revision, 3);
      assert.strictEqual(result.is_updated, false);
      assert.strictEqual(result.projection_status, 'INDEXED');
      assert.strictEqual(updatedDoc.$set.revision, 3);
      assert.strictEqual(updatedDoc.$set.projection_status, 'INDEXED');
    });
  });

  describe('projection outbox and reconciliation', () => {
    const { projectPendingJobs } = require('../src/search/projection-worker');
    const { reconcileCatalog } = require('../src/search/reconcile');

    it('projects pending jobs to Elasticsearch and advances projection status', async () => {
      const pendingJob = {
        _id: 'doc-1',
        id: 'job-uuid-1',
        canonical_url: 'https://example.com/job/1',
        title: 'Frontend Lead',
        company: 'WebTech',
        revision: 2,
        projection_status: 'PENDING',
      };

      let updateQuery = null;
      let updateSet = null;

      const mockCollection = {
        find: () => ({
          sort: () => ({
            limit: () => ({
              hasNext: async () => {
                const has = !updateQuery;
                return has;
              },
              next: async () => pendingJob,
            }),
          }),
        }),
        updateOne: async (query, update) => {
          updateQuery = query;
          updateSet = update.$set;
          return { matchedCount: 1 };
        },
      };

      let indexedDoc = null;
      const mockEsClient = {
        index: async (params) => {
          indexedDoc = params;
        },
      };

      const stats = await projectPendingJobs(mockCollection, mockEsClient, { batchSize: 10 });
      assert.strictEqual(stats.attempted, 1);
      assert.strictEqual(stats.projected, 1);
      assert.strictEqual(updateQuery.revision, 2);
      assert.strictEqual(updateSet.projection_status, 'INDEXED');
      assert.strictEqual(updateSet.projection_version, 2);
    });

    it('reconciles catalog detecting missing, stale, and excess projection documents', async () => {
      const mongoJobs = [
        {
          _id: 'm1',
          id: 'job-1',
          title: 'Title in Mongo',
          description: 'Desc',
          status: 'ACTIVE',
          revision: 1,
        },
      ];

      const mockCollection = {
        find: () => ({
          batchSize: () => ({
            hasNext: async () => mongoJobs.length > 0,
            next: async () => mongoJobs.pop(),
          }),
        }),
        findOne: async ({ id }) => (id === 'job-1' ? { id: 'job-1' } : null),
        updateOne: async () => {},
      };

      // ES returns 404 for job-1 (missing) and returns hit for excess-job-99
      const mockEsClient = {
        get: async () => {
          const err = new Error('Not Found');
          err.meta = { statusCode: 404 };
          throw err;
        },
        search: async () => ({
          hits: {
            hits: [{ _id: 'excess-job-99' }],
          },
        }),
        index: async () => {},
        delete: async () => {},
      };

      const report = await reconcileCatalog(mockCollection, mockEsClient, { dryRun: false });
      assert.strictEqual(report.missing_indexed, 1);
      assert.strictEqual(report.excess_deleted, 1);
      assert.strictEqual(report.dry_run, false);
    });
  });
});
