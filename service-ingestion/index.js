// service-ingestion/index.js
const { Kafka } = require('kafkajs');
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const express = require('express');
const cors = require('cors');

const { upsertJobDocument, ensureMongoIndexes, backfillLegacyDocuments } = require('./src/catalog/db');
const { ensureEsIndex, indexJobToEs } = require('./src/search/elasticsearch');
const { createJobsRouter } = require('./src/api/jobs-router');

// Environment variables
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3003,http://localhost:4200').split(',');
const TOPIC = process.env.KAFKA_TOPIC || 'jobs.new';

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
 * Processes incoming Kafka message, canonicalizes, deduplicates, and dual-writes to MongoDB and Elasticsearch.
 */
async function processMessage(messageValue, { jobsCollection, esClient } = {}) {
  if (!messageValue) return null;
  const rawData = JSON.parse(messageValue.toString());

  let canonicalJob = null;

  // 1. Upsert into MongoDB canonical collection
  if (jobsCollection) {
    canonicalJob = await upsertJobDocument(jobsCollection, rawData);
  } else {
    const { toCanonicalJob } = require('./src/models/job');
    canonicalJob = toCanonicalJob(rawData);
  }

  // 2. Project to Elasticsearch
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
    const db = mongoClient.db('job_platform');
    const jobsCollection = db.collection('jobs');
    console.log('✅ Connected to MongoDB');

    await ensureMongoIndexes(jobsCollection);
    await backfillLegacyDocuments(jobsCollection);

    // 2. Ensure Elasticsearch index exists if available
    if (esClient) {
      await ensureEsIndex(esClient);
    }

    // 3. Start Express API for Job Fetching
    const app = createIngestionApp(jobsCollection, esClient);
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`✅ Jobs API listening on port ${PORT}`);
    });

    // 4. Connect to Kafka (optional in standalone mode)
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
        await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
        console.log(`✅ Subscribed to Kafka topic: ${TOPIC}`);

        await consumer.run({
          eachMessage: async ({ message }) => {
            try {
              const jobData = await processMessage(message.value, { jobsCollection, esClient });
              if (jobData) {
                console.log(`💾 Saved canonical job to DB + ES: ${jobData.title} at ${jobData.company}`);
              }
            } catch (err) {
              console.error('❌ Error processing message:', err);
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
