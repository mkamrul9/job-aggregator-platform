// service-ingestion/index.js
const { Kafka } = require('kafkajs');
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const express = require('express');
const cors = require('cors');

// Environment variables (will be injected by Docker)
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3003').split(',');
const TOPIC = 'jobs.new';

// Utility: escape special regex characters to prevent ReDoS
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureEsIndex(client) {
  try {
    const exists = await client.indices.exists({ index: 'jobs_index' });
    if (!exists) {
      await client.indices.create({ index: 'jobs_index' });
      console.log('✅ Created Elasticsearch index: jobs_index');
    }
  } catch (err) {
    console.warn('⚠️ Elasticsearch index check failed (will retry on write):', err.message);
  }
}

// Function to create Express app with injected collection
function createIngestionApp(jobsCollection = null) {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Ingestion Service is running.' });
  });

  // Start Express API for Job Fetching (MongoDB-backed)
  app.get('/api/jobs', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const skip = (page - 1) * limit;
      const q = req.query.q;
      let query = {};
      if (q) {
        // Escape user input to prevent ReDoS attacks
        const safe = escapeRegex(String(q));
        query = { $or: [{ title: new RegExp(safe, 'i') }, { company: new RegExp(safe, 'i') }] };
      }

      if (!jobsCollection) {
        return res.status(503).json({ error: 'Database collection not available' });
      }

      const jobs = await jobsCollection
        .find(query)
        .sort({ scraped_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      const total = await jobsCollection.countDocuments(query);
      res.json({ jobs, total, page, limit });
    } catch (err) {
      console.error('Error fetching jobs:', err);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  return app;
}

async function processMessage(messageValue, { jobsCollection, esClient } = {}) {
  if (!messageValue) return null;
  const jobData = JSON.parse(messageValue.toString());

  // 4a. Upsert the job into MongoDB based on the URL
  if (jobsCollection) {
    await jobsCollection.updateOne(
      { url: jobData.url },
      {
        $setOnInsert: { scraped_at: new Date() },
        $set: {
          title: jobData.title,
          company: jobData.company,
          raw_description: jobData.raw_description,
        },
      },
      { upsert: true }
    );
  }

  // 4b. Index into Elasticsearch for full-text search
  if (esClient) {
    try {
      await esClient.index({
        index: 'jobs_index',
        id: Buffer.from(jobData.url).toString('base64'), // Deterministic ID from URL
        document: {
          title: jobData.title,
          company: jobData.company,
          url: jobData.url,
          raw_description: jobData.raw_description,
          scraped_at: jobData.scraped_at || new Date().toISOString(),
        },
      });
    } catch (esErr) {
      console.error(`⚠️ Elasticsearch indexing failed for "${jobData.title}":`, esErr.message);
    }
  }

  return jobData;
}

async function run() {
  const kafka = new Kafka({
    clientId: 'job-ingestion-worker',
    brokers: [KAFKA_BROKER],
  });
  const consumer = kafka.consumer({ groupId: 'mongo-ingestion-group' });
  const mongoClient = new MongoClient(MONGO_URI);
  const esClient = new EsClient({ node: ES_NODE });

  try {
    // 1. Connect to MongoDB
    await mongoClient.connect();
    const db = mongoClient.db('job_platform');
    const jobsCollection = db.collection('jobs');
    console.log('✅ Connected to MongoDB');

    // 1b. Ensure Elasticsearch index exists
    await ensureEsIndex(esClient);

    // 2. Connect to Kafka with Retry Backoff
    let retries = 5;
    while (retries > 0) {
      try {
        await consumer.connect();
        break;
      } catch (err) {
        console.error(`❌ Kafka connection failed, retries left: ${retries}`, err);
        retries -= 1;
        if (retries === 0) throw err;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    console.log(`✅ Subscribed to Kafka topic: ${TOPIC}`);

    // 3. Start Express API for Job Fetching
    const app = createIngestionApp(jobsCollection);
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`✅ Jobs API listening on port ${PORT}`);
    });

    // 4. Listen for messages — dual-write to MongoDB AND Elasticsearch
    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const jobData = await processMessage(message.value, { jobsCollection, esClient });
          if (jobData) {
            console.log(`💾 Saved to DB + ES: ${jobData.title} at ${jobData.company}`);
          }
        } catch (err) {
          console.error('❌ Error processing message:', err);
        }
      },
    });

    // Handle graceful shutdowns
    process.on('SIGINT', async () => {
      server.close();
      await consumer.disconnect();
      await mongoClient.close();
      await esClient.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('🔥 Fatal Worker Error:', error);
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
