// service-ingestion/index.js
const { Kafka } = require('kafkajs');
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const express = require('express');
const cors = require('cors');

const {
  upsertJobDocument,
  ensureMongoIndexes,
  backfillLegacyDocuments,
  quarantineDeadLetter,
} = require('./src/catalog/db');
const { ensureEsIndex, indexJobToEs } = require('./src/search/elasticsearch');
const { startProjectionWorker } = require('./src/search/projection-worker');
const { validateIncomingEvent } = require('./src/events/validator');
const { createJobsRouter } = require('./src/api/jobs-router');

// Environment variables
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3003,http://localhost:4200').split(',');
const TOPIC = process.env.KAFKA_TOPIC || 'job.collected.v1';

// Utility: escape special regex characters to prevent ReDoS
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates the Express application configured with canonical catalog routes.
 */
function createIngestionApp(jobsCollection = null, esClient = null) {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Ingestion Service is running.' });
  });

  // Mount unified jobs router for both authoritative v1 and legacy paths
  const jobsRouter = createJobsRouter({ jobsCollection, esClient });
  app.use('/api/v1/jobs', jobsRouter);
  app.use('/api/jobs', jobsRouter);

  return app;
}

/**
 * Processes incoming Kafka message or event buffer.
 * Performs schema validation, dead-letter quarantine for poison events,
 * atomic MongoDB persistence with revision tracking, and ES projection.
 */
async function processMessage(messageValue, { jobsCollection, deadLettersCollection = null, esClient } = {}) {
  if (!messageValue) return null;

  // 1. Validate envelope and payload
  const validation = validateIncomingEvent(messageValue);
  if (!validation.valid) {
    console.warn(`⚠️ Poison/Malformed event detected: ${validation.errors.join('; ')}`);
    if (deadLettersCollection) {
      await quarantineDeadLetter(deadLettersCollection, messageValue, validation.errors, validation.parsed);
    }
    return { quarantined: true, errors: validation.errors };
  }

  let canonicalJob = null;

  // 2. Upsert into MongoDB canonical collection
  if (jobsCollection) {
    canonicalJob = await upsertJobDocument(jobsCollection, validation.payload);
  } else {
    const { toCanonicalJob } = require('./src/models/job');
    canonicalJob = toCanonicalJob(validation.payload);
  }

  // 3. Project to Elasticsearch if available
  if (esClient && canonicalJob) {
    try {
      await indexJobToEs(esClient, canonicalJob);
    } catch (esErr) {
      console.error(`⚠️ Elasticsearch indexing failed for "${canonicalJob.title}":`, esErr.message);
    }
  }

  return canonicalJob;
}

async function run() {
  const mongoClient = new MongoClient(MONGO_URI);
  let esClient = null;

  try {
    if (ES_NODE) {
      esClient = new EsClient({ node: ES_NODE });
    }
  } catch (err) {
    console.warn('⚠️ Elasticsearch client initialization failed:', err.message);
  }

  try {
    // 1. Connect to MongoDB and initialize indexes
    await mongoClient.connect();
    const db = mongoClient.db(process.env.MONGO_DB || 'job_platform');
    const jobsCollection = db.collection('jobs');
    const deadLettersCollection = db.collection('dead_letters');
    console.log('✅ Connected to MongoDB');

    await ensureMongoIndexes(jobsCollection, deadLettersCollection);
    await backfillLegacyDocuments(jobsCollection);

    // 2. Ensure Elasticsearch index exists if available
    if (esClient) {
      await ensureEsIndex(esClient);
    }

    // 3. Start background projection outbox worker to sync pending documents
    let projectionWorker = null;
    if (esClient) {
      projectionWorker = startProjectionWorker(jobsCollection, esClient, { intervalMs: 15000, batchSize: 50 });
      console.log('✅ Background projection outbox worker started');
    }

    // 4. Start Express API for Job Fetching
    const app = createIngestionApp(jobsCollection, esClient);
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`✅ Jobs API listening on port ${PORT}`);
    });

    // 5. Connect to Kafka (optional in standalone mode)
    const isStandalone = process.env.STANDALONE_MODE === 'true';
    let consumer = null;

    if (!isStandalone) {
      const kafka = new Kafka({
        clientId: 'job-ingestion-worker',
        brokers: [KAFKA_BROKER],
      });
      consumer = kafka.consumer({ groupId: 'mongo-ingestion-group' });

      let retries = 5;
      while (retries > 0) {
        try {
          await consumer.connect();
          break;
        } catch (err) {
          console.error(`❌ Kafka connection failed, retries left: ${retries}`, err.message);
          retries -= 1;
          if (retries === 0) {
            console.warn('⚠️ Starting without Kafka consumer (API remains operational)');
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      if (retries > 0) {
        // Subscribe to both versioned topic and legacy topic for seamless transition
        await consumer.subscribe({ topics: [TOPIC, 'jobs.new'], fromBeginning: true });
        console.log(`✅ Subscribed to Kafka topics: ${TOPIC}, jobs.new`);

        await consumer.run({
          autoCommit: false,
          eachMessage: async ({ topic, partition, message }) => {
            try {
              const outcome = await processMessage(message.value, {
                jobsCollection,
                deadLettersCollection,
                esClient,
              });

              // Advance offset ONLY after canonical MongoDB persistence or durable dead-letter quarantine
              const nextOffset = (BigInt(message.offset) + 1n).toString();
              await consumer.commitOffsets([{ topic, partition, offset: nextOffset }]);

              if (outcome && !outcome.quarantined) {
                console.log(`💾 Saved canonical job to DB + ES: ${outcome.title} at ${outcome.company}`);
              }
            } catch (err) {
              // Critical: Do NOT commit offset on unrecoverable DB error so work is not lost
              console.error('❌ Error processing message, offset not committed:', err.message);
              throw err;
            }
          },
        });
      }
    } else {
      console.log('ℹ️ Running in STANDALONE_MODE: Kafka consumer disabled');
    }

    // Handle graceful shutdowns
    const shutdown = async () => {
      server.close();
      if (projectionWorker) {
        projectionWorker.stop();
      }
      if (consumer) {
        try {
          await consumer.disconnect();
        } catch {}
      }
      await mongoClient.close();
      if (esClient) {
        try {
          await esClient.close();
        } catch {}
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('🔥 Fatal Ingestion Worker Error:', error);
    process.exit(1);
  }
}

module.exports = {
  createIngestionApp,
  escapeRegex,
  processMessage,
  ensureEsIndex,
  run,
};

if (require.main === module) {
  run();
}
