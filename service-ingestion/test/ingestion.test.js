// service-ingestion/test/ingestion.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const {
  createIngestionApp,
  escapeRegex,
  processMessage,
} = require('../index');

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

    it('GET /api/jobs clamps pagination parameters correctly', async () => {
      let capturedSkip = null;
      let capturedLimit = null;
      let capturedQuery = null;

      const mockCollection = {
        find: (query) => {
          capturedQuery = query;
          return {
            sort: () => ({
              skip: (s) => {
                capturedSkip = s;
                return {
                  limit: (l) => {
                    capturedLimit = l;
                    return {
                      toArray: async () => [{ title: 'Go Engineer', company: 'Acme' }],
                    };
                  },
                };
              },
            }),
          };
        },
        countDocuments: async () => 1,
      };

      const app = createIngestionApp(mockCollection);

      // Test negative page and overly large limit (clamped to page=1, limit=100)
      const res = await request(app).get('/api/jobs?page=-5&limit=500');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.page, 1);
      assert.strictEqual(res.body.limit, 100);
      assert.strictEqual(capturedSkip, 0);
      assert.strictEqual(capturedLimit, 100);

      // Test query parameter filtering with regex escaping
      const resQuery = await request(app).get('/api/jobs?q=C++');
      assert.strictEqual(resQuery.status, 200);
      assert.ok(capturedQuery.$or);
      assert.strictEqual(capturedQuery.$or.length, 2);
    });
  });

  describe('processMessage', () => {
    it('should return null if messageValue is empty', async () => {
      const result = await processMessage(null);
      assert.strictEqual(result, null);
    });

    it('should parse message and dual-write to Mongo and Elasticsearch', async () => {
      let mongoUpdateArgs = null;
      let esIndexArgs = null;

      const mockCollection = {
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
      assert.strictEqual(mongoUpdateArgs.filter.url, payload.url);
      assert.strictEqual(mongoUpdateArgs.options.upsert, true);
      assert.strictEqual(esIndexArgs.index, 'jobs_index');
      assert.strictEqual(
        esIndexArgs.id,
        Buffer.from(payload.url).toString('base64')
      );
    });

    it('should tolerate Elasticsearch indexing failure gracefully', async () => {
      const mockCollection = {
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
      // Should not throw
      const processed = await processMessage(messageValue, {
        jobsCollection: mockCollection,
        esClient: mockEsClient,
      });

      assert.strictEqual(processed.company, 'Resilient Co');
    });
  });
});
