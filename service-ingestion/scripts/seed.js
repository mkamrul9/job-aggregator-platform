// service-ingestion/scripts/seed.js
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const { ensureMongoIndexes, upsertJobDocument } = require('../src/catalog/db');
const { ensureEsIndex, indexJobToEs } = require('../src/search/elasticsearch');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const SEED_FILE = path.join(__dirname, '..', 'seed', 'jobs.json');

async function seed() {
  console.log('🌱 Starting service-ingestion catalog seed...');

  if (!fs.existsSync(SEED_FILE)) {
    console.error(`❌ Seed file not found at ${SEED_FILE}`);
    process.exit(1);
  }

  const rawJobs = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  console.log(`📋 Read ${rawJobs.length} seed job listings from ${SEED_FILE}`);

  // 1. Connect to MongoDB
  const mongoClient = new MongoClient(MONGO_URI);
  let db, jobsCollection;
  try {
    await mongoClient.connect();
    db = mongoClient.db('job_platform');
    jobsCollection = db.collection('jobs');
    console.log(`✅ Connected to MongoDB at ${MONGO_URI}`);
    await ensureMongoIndexes(jobsCollection);
  } catch (err) {
    console.error(`❌ MongoDB connection failed:`, err.message);
    process.exit(1);
  }

  // 2. Connect to Elasticsearch (optional, graceful if offline)
  let esClient = null;
  try {
    esClient = new EsClient({ node: ES_NODE });
    await ensureEsIndex(esClient);
    console.log(`✅ Connected to Elasticsearch at ${ES_NODE}`);
  } catch (err) {
    console.warn(`⚠️ Elasticsearch not available (${err.message}). Seeding MongoDB only.`);
    esClient = null;
  }

  // 3. Upsert jobs into MongoDB and Elasticsearch
  let mongoCount = 0;
  let esCount = 0;

  for (const jobData of rawJobs) {
    try {
      const canonical = await upsertJobDocument(jobsCollection, jobData);
      mongoCount += 1;

      if (esClient) {
        try {
          await indexJobToEs(esClient, canonical);
          esCount += 1;
        } catch (esErr) {
          console.warn(`Warning indexing ${canonical.id} to ES:`, esErr.message);
        }
      }
    } catch (err) {
      console.error(`Error seeding job ${jobData.title}:`, err.message);
    }
  }

  console.log(`\n🎉 Seed Complete!`);
  console.log(`   - MongoDB: ${mongoCount}/${rawJobs.length} canonical records upserted`);
  if (esClient) {
    console.log(`   - Elasticsearch: ${esCount}/${rawJobs.length} documents projected`);
  }

  await mongoClient.close();
  if (esClient) {
    await esClient.close();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal seed error:', err);
      process.exit(1);
    });
}

module.exports = { seed };
