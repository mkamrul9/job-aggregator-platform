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

// Initialize Kafka Client
const kafka = new Kafka({
  clientId: 'job-ingestion-worker',
  brokers: [KAFKA_BROKER],
});
const consumer = kafka.consumer({ groupId: 'mongo-ingestion-group' });

// Initialize MongoDB Client
const mongoClient = new MongoClient(MONGO_URI);

// Initialize Elasticsearch Client
const esClient = new EsClient({ node: ES_NODE });

// Initialize Express App
const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Utility: escape special regex characters to prevent ReDoS
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureEsIndex() {
  try {
    const exists = await esClient.indices.exists({ index: 'jobs_index' });
    if (!exists) {
      await esClient.indices.create({ index: 'jobs_index' });
      console.log('✅ Created Elasticsearch index: jobs_index');
    }
  } catch (err) {
    console.warn('⚠️ Elasticsearch index check failed (will retry on write):', err.message);
  }
}

async function run() {
  try {
    // 1. Connect to MongoDB
    await mongoClient.connect();
    const db = mongoClient.db('job_platform');
    const jobsCollection = db.collection('jobs');
    console.log('✅ Connected to MongoDB');

    // 1b. Ensure Elasticsearch index exists
    await ensureEsIndex();

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
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    console.log(`✅ Subscribed to Kafka topic: ${TOPIC}`);

    // 3. Start Express API for Job Fetching (MongoDB-backed)
    app.get('/api/jobs', async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const page  = Math.max(parseInt(req.query.page)  || 1, 1);
        const skip  = (page - 1) * limit;
        const q = req.query.q;
        let query = {};
        if (q) {
           // Escape user input to prevent ReDoS attacks
           const safe = escapeRegex(q);
           query = { $or: [ { title: new RegExp(safe, 'i') }, { company: new RegExp(safe, 'i') } ] };
        }

        const jobs  = await jobsCollection.find(query)
          .sort({ scraped_at: -1 }).skip(skip).limit(limit).toArray();
        const total = await jobsCollection.countDocuments(query);
        res.json({ jobs, total, page, limit });
      } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ error: 'Failed to fetch jobs' });
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'Ingestion Service is running.' });
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`✅ Jobs API listening on port ${PORT}`);
    });

    // 4. Listen for messages — dual-write to MongoDB AND Elasticsearch
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          // Parse the JSON buffer sent by the Go scraper
          const jobData = JSON.parse(message.value.toString());
          
          // 4a. Upsert the job into MongoDB based on the URL
          await jobsCollection.updateOne(
            { url: jobData.url },
            { 
              $setOnInsert: { scraped_at: new Date() },
              $set: {
                title: jobData.title,
                company: jobData.company,
                raw_description: jobData.raw_description
              }
            },
            { upsert: true }
          );

          // 4b. Index into Elasticsearch for full-text search
          try {
            await esClient.index({
              index: 'jobs_index',
              id: Buffer.from(jobData.url).toString('base64'), // Deterministic ID from URL
              document: {
                title: jobData.title,
                company: jobData.company,
                url: jobData.url,
                raw_description: jobData.raw_description,
                scraped_at: jobData.scraped_at || new Date().toISOString()
              }
            });
          } catch (esErr) {
            console.error(`⚠️ Elasticsearch indexing failed for "${jobData.title}":`, esErr.message);
            // Don't throw — MongoDB write already succeeded
          }

          console.log(`💾 Saved to DB + ES: ${jobData.title} at ${jobData.company}`);
        } catch (err) {
          console.error('❌ Error processing message:', err);
        }
      },
    });
  } catch (error) {
    console.error('🔥 Fatal Worker Error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdowns
process.on('SIGINT', async () => {
  await consumer.disconnect();
  await mongoClient.close();
  await esClient.close();
  process.exit(0);
});

run();
