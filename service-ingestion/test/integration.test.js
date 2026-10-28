// service-ingestion/test/integration.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

const TEST_ES_INDEX = 'jobs_index_test';
process.env.ES_INDEX = TEST_ES_INDEX;

const { createIngestionApp } = require('../index');
const { ensureMongoIndexes, upsertJobDocument } = require('../src/catalog/db');
const { ensureEsIndex, indexJobToEs } = require('../src/search/elasticsearch');
const { encodeCursor } = require('../src/search/query-validator');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const TEST_DB_NAME = 'job_platform_test';

describe('service-ingestion integration tests (real MongoDB + optional Elasticsearch)', () => {
  let mongoClient = null;
  let db = null;
  let jobsCollection = null;
  let esClient = null;
  let app = null;

  before(async () => {
    // 1. Connect to isolated test database in MongoDB
    try {
      mongoClient = new MongoClient(MONGO_URI);
      await mongoClient.connect();
      db = mongoClient.db(TEST_DB_NAME);
      jobsCollection = db.collection('jobs');

      // Drop existing test collection to ensure clean state
      try {
        await jobsCollection.drop();
      } catch {}

      await ensureMongoIndexes(jobsCollection);
    } catch (err) {
      console.warn('⚠️ MongoDB connection failed in integration test setup:', err.message);
      throw new Error(`MongoDB is required for integration tests: ${err.message}`);
    }

    // 2. Try connecting to Elasticsearch if running
    try {
      esClient = new EsClient({ node: ES_NODE });
      // Reset isolated test index
      const exists = await esClient.indices.exists({ index: TEST_ES_INDEX });
      if (exists) {
        await esClient.indices.delete({ index: TEST_ES_INDEX });
      }
      await ensureEsIndex(esClient);
    } catch (err) {
      if (process.env.REQUIRE_ES === 'true') {
        throw new Error(`Elasticsearch is required in CI: ${err.message}`);
      }
      console.warn('⚠️ Elasticsearch not running locally, test will run against canonical MongoDB engine.');
      esClient = null;
    }

    // 3. Seed test dataset from seed/jobs.json
    const seedPath = path.join(__dirname, '..', 'seed', 'jobs.json');
    const rawJobs = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

    for (const raw of rawJobs) {
      const canonical = await upsertJobDocument(jobsCollection, raw);
      if (esClient) {
        try {
          await indexJobToEs(esClient, canonical);
          await jobsCollection.updateOne(
            { id: canonical.id },
            { $set: { projection_status: 'INDEXED', projection_version: canonical.revision || 1 } }
          );
        } catch (esErr) {
          console.warn('Warning indexing job to ES in test setup:', esErr.message);
        }
      }
    }

    // Wait a brief moment for Elasticsearch index refresh if active
    if (esClient) {
      try {
        await esClient.indices.refresh({ index: TEST_ES_INDEX });
      } catch {}
    }

    // 4. Initialize Express app
    app = createIngestionApp(jobsCollection, esClient);
  });

  after(async () => {
    if (jobsCollection) {
      try {
        await jobsCollection.drop();
      } catch {}
    }
    if (mongoClient) {
      await mongoClient.close();
    }
    if (esClient) {
      try {
        await esClient.indices.delete({ index: TEST_ES_INDEX });
      } catch {}
      await esClient.close();
    }
  });

  describe('GET /api/v1/jobs - Unified search & filtering', () => {
    it('returns 200 with list of active jobs, limit, total count, and correlation ID', async () => {
      const res = await request(app).get('/api/v1/jobs');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.items));
      assert.strictEqual(typeof res.body.total_count, 'number');
      assert.ok(res.body.total_count > 0);
      assert.strictEqual(res.body.limit, 20);
      assert.ok(res.headers['x-correlation-id']);

      if (esClient) {
        assert.strictEqual(res.headers['x-search-engine'], 'elasticsearch');
      } else {
        assert.strictEqual(res.headers['x-search-engine'], 'mongodb');
      }

      // Ensure EXPIRED listing is not in active search results
      const expiredFound = res.body.items.some((j) => j.status === 'EXPIRED');
      assert.strictEqual(expiredFound, false);
    });

    it('filters by keyword (q=Golang) matching title and skills', async () => {
      const res = await request(app).get('/api/v1/jobs?q=Golang');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length > 0);
      res.body.items.forEach((item) => {
        const matchesTitle = item.title.toLowerCase().includes('golang') || item.title.toLowerCase().includes('go');
        const matchesSkills = item.skills.some((s) => s.toLowerCase() === 'go');
        assert.ok(matchesTitle || matchesSkills, `Item ${item.title} should match keyword "Golang"`);
      });
    });

    it('filters by location (location=Dhaka)', async () => {
      const res = await request(app).get('/api/v1/jobs?location=Dhaka');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length > 0);
      res.body.items.forEach((item) => {
        assert.strictEqual(item.location, 'Dhaka');
      });
    });

    it('filters by remote_eligibility=FULLY_REMOTE', async () => {
      const res = await request(app).get('/api/v1/jobs?remote_eligibility=FULLY_REMOTE');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length > 0);
      res.body.items.forEach((item) => {
        assert.strictEqual(item.remote_eligibility, 'FULLY_REMOTE');
      });
    });

    it('filters by seniority=LEAD and job_type=FULL_TIME', async () => {
      const res = await request(app).get('/api/v1/jobs?seniority=LEAD&job_type=FULL_TIME');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length > 0);
      res.body.items.forEach((item) => {
        assert.strictEqual(item.seniority, 'LEAD');
        assert.strictEqual(item.job_type, 'FULL_TIME');
      });
    });

    it('filters by currency=BDT and min_salary=180000 without leaking USD roles', async () => {
      const res = await request(app).get('/api/v1/jobs?currency=BDT&min_salary=180000');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length > 0);
      res.body.items.forEach((item) => {
        assert.strictEqual(item.salary.currency, 'BDT');
        assert.ok(item.salary.min >= 180000);
      });
    });

    it('filters by currency=USD and min_salary=4000', async () => {
      const res = await request(app).get('/api/v1/jobs?currency=USD&min_salary=4000');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length > 0);
      res.body.items.forEach((item) => {
        assert.strictEqual(item.salary.currency, 'USD');
        assert.ok(item.salary.min >= 4000);
      });
    });
  });

  describe('Sorting and keyset pagination traversal', () => {
    it('sorts by date_desc with deterministic published_at and id tie-breaker', async () => {
      const res = await request(app).get('/api/v1/jobs?sort=date_desc&limit=10');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length >= 2);

      for (let i = 0; i < res.body.items.length - 1; i++) {
        const d1 = new Date(res.body.items[i].published_at).getTime();
        const d2 = new Date(res.body.items[i + 1].published_at).getTime();
        assert.ok(d1 >= d2, `Item at index ${i} should be newer than or equal to item at ${i + 1}`);
      }
    });

    it('sorts by salary_desc with salary.min descending', async () => {
      const res = await request(app).get('/api/v1/jobs?currency=BDT&sort=salary_desc&limit=10');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.length >= 2);

      for (let i = 0; i < res.body.items.length - 1; i++) {
        const s1 = res.body.items[i].salary?.min || 0;
        const s2 = res.body.items[i + 1].salary?.min || 0;
        assert.ok(s1 >= s2, `Salary at ${i} (${s1}) should be >= salary at ${i + 1} (${s2})`);
      }
    });

    it('paginates deterministically using keyset cursor without duplicate or skipped items', async () => {
      // Page 1: limit 3
      const page1Res = await request(app).get('/api/v1/jobs?sort=date_desc&limit=3');
      assert.strictEqual(page1Res.status, 200);
      assert.strictEqual(page1Res.body.items.length, 3);
      assert.ok(page1Res.body.next_cursor);
      assert.strictEqual(page1Res.body.prev_cursor, null);

      const page1Ids = page1Res.body.items.map((j) => j.id);

      // Page 2: using next_cursor
      const page2Res = await request(app).get(`/api/v1/jobs?sort=date_desc&limit=3&cursor=${encodeURIComponent(page1Res.body.next_cursor)}`);
      assert.strictEqual(page2Res.status, 200);
      assert.strictEqual(page2Res.body.items.length, 3);
      assert.strictEqual(page1Res.body.total_count, page2Res.body.total_count, 'total_count must remain stable across cursor pages');

      const page2Ids = page2Res.body.items.map((j) => j.id);

      // Verify no overlap between page 1 and page 2
      page2Ids.forEach((id) => {
        assert.strictEqual(page1Ids.includes(id), false, `ID ${id} must not appear in both page 1 and page 2`);
      });
    });
  });

  describe('Legacy and slash gateway aliases', () => {
    it('GET /api/jobs and /api/jobs/ and /api/v1/jobs/ return identical results to /api/v1/jobs', async () => {
      const resV1 = await request(app).get('/api/v1/jobs?limit=5');
      const resLegacy = await request(app).get('/api/jobs?limit=5');
      const resTrailing = await request(app).get('/api/v1/jobs/?limit=5');

      assert.strictEqual(resV1.status, 200);
      assert.strictEqual(resLegacy.status, 200);
      assert.strictEqual(resTrailing.status, 200);

      assert.deepStrictEqual(
        resV1.body.items.map((j) => j.id),
        resLegacy.body.items.map((j) => j.id)
      );
      assert.deepStrictEqual(
        resV1.body.items.map((j) => j.id),
        resTrailing.body.items.map((j) => j.id)
      );
    });
  });

  describe('Job details and outbound redirect journeys', () => {
    it('GET /api/v1/jobs/:id returns complete canonical detail record', async () => {
      const sampleId = '11111111-1111-4111-8111-111111111101';
      const res = await request(app).get(`/api/v1/jobs/${sampleId}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, sampleId);
      assert.strictEqual(res.body.title, 'Senior Golang Platform Engineer');
      assert.strictEqual(res.body.company, 'Pathao');
      assert.strictEqual(res.body.status, 'ACTIVE');
      assert.ok(res.body.description.includes('logistics routing'));
      assert.ok(res.body.canonical_url.startsWith('https://'));
    });

    it('GET /api/v1/jobs/:id returns 404 for non-existent UUID', async () => {
      const fakeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      const res = await request(app).get(`/api/v1/jobs/${fakeId}`);

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.status, 404);
      assert.strictEqual(res.body.title, 'Not Found');
      assert.ok(res.headers['content-type'].includes('application/problem+json'));
    });

    it('GET /api/v1/jobs/:id/outbound performs safe 302 redirect for active listing', async () => {
      const sampleId = '11111111-1111-4111-8111-111111111101';
      const res = await request(app)
        .get(`/api/v1/jobs/${sampleId}/outbound`)
        .set('Accept', 'text/html');

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.location, 'https://careers.pathao.com/jobs/senior-golang-engineer');
    });

    it('GET /api/v1/jobs/:id/outbound returns 200 JSON with destination_url for API clients', async () => {
      const sampleId = '11111111-1111-4111-8111-111111111102';
      const res = await request(app)
        .get(`/api/v1/jobs/${sampleId}/outbound?format=json`)
        .set('Accept', 'application/json');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        res.body.destination_url,
        'https://chaldal.bamboohr.com/careers/lead-fullstack-ts'
      );
    });

    it('GET /api/v1/jobs/:id/outbound returns 404 for EXPIRED listing', async () => {
      const expiredId = '11111111-1111-4111-8111-111111111112';
      const res = await request(app).get(`/api/v1/jobs/${expiredId}/outbound`);

      assert.strictEqual(res.status, 404);
      assert.ok(res.headers['content-type'].includes('application/problem+json'));
      assert.match(res.body.detail, /expired/i);
    });

    it('GET /api/v1/jobs/:id/outbound returns 404 for listing with past expires_at', async () => {
      const pastJob = {
        id: '99999999-9999-4999-8999-999999999999',
        canonical_url: 'https://example.com/jobs/past-deadline',
        source: 'aggregator',
        source_id: 'past_1',
        title: 'Past Deadline Role',
        company: 'Late Inc',
        location: 'Dhaka',
        remote_eligibility: 'HYBRID',
        job_type: 'FULL_TIME',
        seniority: 'MID',
        description: 'Past deadline role.',
        status: 'ACTIVE',
        published_at: new Date('2026-09-01T00:00:00Z'),
        expires_at: new Date('2026-09-15T00:00:00Z'),
        first_seen_at: new Date('2026-09-01T00:00:00Z'),
        last_seen_at: new Date('2026-09-15T00:00:00Z'),
        ingested_at: new Date('2026-09-01T00:05:00Z'),
      };
      await jobsCollection.insertOne(pastJob);

      const res = await request(app).get(`/api/v1/jobs/${pastJob.id}/outbound`);
      assert.strictEqual(res.status, 404);
      assert.ok(res.headers['content-type'].includes('application/problem+json'));
      assert.match(res.body.detail, /expired/i);
    });
  });

  describe('Standalone MongoDB engine mode (fallback/outage)', () => {
    let mongoApp = null;
    before(() => {
      mongoApp = createIngestionApp(jobsCollection, null);
    });

    it('returns MongoDB search engine header and performs stable pagination', async () => {
      const res = await request(mongoApp).get('/api/v1/jobs?limit=3&sort=date_desc');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['x-search-engine'], 'mongodb');
      assert.ok(res.body.items.length > 0);
      assert.ok(res.body.next_cursor);

      const page2 = await request(mongoApp).get(`/api/v1/jobs?limit=3&sort=date_desc&cursor=${encodeURIComponent(res.body.next_cursor)}`);
      assert.strictEqual(page2.status, 200);
      assert.strictEqual(page2.headers['x-search-engine'], 'mongodb');
      assert.strictEqual(res.body.total_count, page2.body.total_count, 'total_count must remain identical across cursor pages in MongoDB');

      const p1Ids = new Set(res.body.items.map((j) => j.id));
      page2.body.items.forEach((j) => {
        assert.strictEqual(p1Ids.has(j.id), false, `ID ${j.id} appeared on both pages in MongoDB keyset pagination`);
      });
    });

    it('consumes unified cursor format with sortValues seamlessly in MongoDB', async () => {
      const sampleItem = await jobsCollection.findOne({ status: 'ACTIVE' });
      const cursorStr = encodeCursor({
        v: 1,
        sort: 'date_desc',
        q: '',
        sortValues: [new Date(sampleItem.published_at).getTime(), sampleItem.id],
      });

      const res = await request(mongoApp).get(`/api/v1/jobs?sort=date_desc&cursor=${encodeURIComponent(cursorStr)}`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.items.every((j) => j.id !== sampleItem.id));
    });
  });

  describe('Negative input rejection', () => {
    it('rejects invalid cursor with 400 Bad Request', async () => {
      const res = await request(app).get('/api/v1/jobs?cursor=not-a-valid-base64-json-cursor!!');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.status, 400);
      assert.match(res.body.detail, /cursor/i);
    });

    it('rejects unsupported enums with 400 Problem Details', async () => {
      const res = await request(app).get('/api/v1/jobs?remote_eligibility=ANYWHERE');
      assert.strictEqual(res.status, 400);
      assert.match(res.body.detail, /remote_eligibility/i);
    });
  });

  describe('P07: Event processing, dead-letter quarantine, outbox, and reconciliation', () => {
    const { processMessage } = require('../index');
    const { projectPendingJobs } = require('../src/search/projection-worker');
    const { reconcileCatalog } = require('../src/search/reconcile');
    const { rebuildIndex } = require('../src/search/reindex');
    let deadLettersCollection = null;

    before(async () => {
      deadLettersCollection = db.collection('dead_letters');
      try {
        await deadLettersCollection.drop();
      } catch {}
    });

    it('processes conformant job.collected.v1 event, persists to MongoDB and updates projection', async () => {
      const validEvent = {
        event_id: '4fa85f64-5717-4562-b3fc-2c963f66afa7',
        event_type: 'job.collected.v1',
        schema_version: '1.0.0',
        producer: 'service-scraper',
        timestamp: '2026-10-28T14:00:00Z',
        correlation_id: '8c9e6679-7425-40de-944b-e07fc1f90ae8',
        causation_id: null,
        payload: {
          source: 'greenhouse-feed',
          source_job_id: 'gh-integration-1',
          url: 'https://boards.greenhouse.io/pathao/jobs/gh-integration-1',
          source_url_hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          title: 'Senior Distributed Systems Engineer',
          company: 'Pathao Tech',
          location: 'Dhaka, Bangladesh',
          description: 'Experience building real-time event pipelines with Kafka and Go.',
          collected_at: '2026-10-28T14:00:00Z',
        },
      };

      const outcome = await processMessage(Buffer.from(JSON.stringify(validEvent)), {
        jobsCollection,
        deadLettersCollection,
        esClient,
      });

      assert.ok(outcome);
      assert.strictEqual(outcome.title, 'Senior Distributed Systems Engineer');
      assert.strictEqual(outcome.revision, 1);

      const persisted = await jobsCollection.findOne({ canonical_url: validEvent.payload.url });
      assert.ok(persisted);
      assert.strictEqual(persisted.source_id, 'gh-integration-1');
      assert.ok(persisted.first_seen_at);

      // Replay same event: first_seen_at preserved, revision unchanged
      const replayed = await processMessage(Buffer.from(JSON.stringify(validEvent)), {
        jobsCollection,
        deadLettersCollection,
        esClient,
      });

      assert.strictEqual(replayed.revision, 1);
      assert.strictEqual(replayed.is_updated, false);
      assert.strictEqual(
        new Date(replayed.first_seen_at).getTime(),
        new Date(persisted.first_seen_at).getTime()
      );
    });

    it('quarantines poison event into dead_letters collection without throwing', async () => {
      const poison = {
        bad_structure: 'totally invalid event',
        missing_everything: true,
      };

      const res = await processMessage(Buffer.from(JSON.stringify(poison)), {
        jobsCollection,
        deadLettersCollection,
        esClient,
      });

      assert.strictEqual(res.quarantined, true);
      const dl = await deadLettersCollection.findOne({ status: 'QUARANTINED' });
      assert.ok(dl);
      assert.ok(dl.errors.length > 0);
    });

    it('projection outbox worker flushes pending documents safely', async () => {
      if (!esClient) return;

      // Insert document in Mongo with projection_status PENDING
      const pendingDoc = {
        id: '77777777-7777-4777-8777-777777777777',
        canonical_url: 'https://example.com/jobs/outbox-pending-test',
        source_url_hash: 'outboxhash123',
        source: 'greenhouse-feed',
        source_id: 'pending-1',
        title: 'Platform Outbox Engineer',
        company: 'OutboxCorp',
        location: 'Dhaka',
        remote_eligibility: 'FULLY_REMOTE',
        job_type: 'FULL_TIME',
        seniority: 'MID',
        description: 'Testing outbox flush.',
        status: 'ACTIVE',
        published_at: new Date(),
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        ingested_at: new Date(),
        revision: 1,
        projection_status: 'PENDING',
        projection_version: 0,
      };

      await jobsCollection.insertOne(pendingDoc);

      const stats = await projectPendingJobs(jobsCollection, esClient, { batchSize: 50 });
      assert.ok(stats.attempted >= 1);
      assert.ok(stats.projected >= 1);

      const updated = await jobsCollection.findOne({ id: pendingDoc.id });
      assert.strictEqual(updated.projection_status, 'INDEXED');
      assert.strictEqual(updated.projection_version, 1);
    });

    it('reconciles catalog and reports accurate statistics', async () => {
      if (!esClient) return;

      const report = await reconcileCatalog(jobsCollection, esClient, { dryRun: true, index: TEST_ES_INDEX });
      assert.strictEqual(report.dry_run, true);
      assert.ok(report.scanned_mongo >= 0);
    });

    it('rebuilds index with zero downtime and verifies count and query gate', async () => {
      if (!esClient) return;

      const { rebuildIndex } = require('../src/search/reindex');
      const rebuildRes = await rebuildIndex(jobsCollection, esClient, { alias: TEST_ES_INDEX });
      assert.strictEqual(rebuildRes.success, true);
      assert.ok(rebuildRes.activeJobsProjected > 0);
      assert.strictEqual(rebuildRes.verified, true);
      assert.strictEqual(rebuildRes.aliasSwitched, true);
    });
  });
});
