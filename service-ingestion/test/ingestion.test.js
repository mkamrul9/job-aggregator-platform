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
  });
});
