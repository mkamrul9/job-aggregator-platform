// service-ingestion/scripts/seed.js
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const { ensureMongoIndexes, upsertJobDocument } = require('../src/catalog/db');
const { ensureEsIndex, indexJobToEs } = require('../src/search/elasticsearch');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'job_platform';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const SEED_FILE = path.join(__dirname, '..', 'seed', 'jobs.json');

async function seed(options = {}) {
  const requireEs = options.requireEs ?? (process.env.REQUIRE_ES === 'true');
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
    db = mongoClient.db(MONGO_DB_NAME);
    jobsCollection = db.collection('jobs');
    console.log(`✅ Connected to MongoDB (${MONGO_DB_NAME}) at ${MONGO_URI}`);
    await ensureMongoIndexes(jobsCollection);
  } catch (err) {
    console.error(`❌ MongoDB connection/index setup failed:`, err.message);
    await mongoClient.close().catch(() => {});
    process.exit(1);
  }

  // 2. Connect to Elasticsearch (optional unless requireEs is true)
  let esClient = null;
  try {
    esClient = new EsClient({ node: ES_NODE });
    await ensureEsIndex(esClient);
    console.log(`✅ Connected to Elasticsearch at ${ES_NODE}`);
  } catch (err) {
    if (requireEs) {
      console.error(`❌ Elasticsearch required but unavailable: ${err.message}`);
      await mongoClient.close().catch(() => {});
      process.exit(1);
    }
    console.warn(`⚠️ Elasticsearch not available (${err.message}). Seeding MongoDB only (explicit fallback).`);
    esClient = null;
  }

  // 3. Upsert jobs into MongoDB and Elasticsearch
  let mongoAttempted = 0;
  let mongoSucceeded = 0;
  let mongoFailed = 0;
  let esAttempted = 0;
  let esSucceeded = 0;
  let esFailed = 0;

  for (const jobData of rawJobs) {
    mongoAttempted++;
    let canonical = null;
    try {
      canonical = await upsertJobDocument(jobsCollection, jobData);
      mongoSucceeded++;
    } catch (err) {
      mongoFailed++;
      console.error(`❌ Error seeding job in MongoDB "${jobData.title}":`, err.message);
    }

    if (canonical && esClient) {
      esAttempted++;
      try {
        const res = await indexJobToEs(esClient, canonical);
        if (res && res.success) {
          esSucceeded++;
          await jobsCollection.updateOne(
            { id: canonical.id },
            { $set: { projection_status: 'INDEXED', projection_version: canonical.revision || 1 } }
          );
        } else {
          esFailed++;
          console.error(`❌ ES indexing reported failure for "${canonical.id}"`);
        }
      } catch (esErr) {
        esFailed++;
        console.error(`❌ Error indexing "${canonical.id}" to ES:`, esErr.message);
      }
    }
  }

  console.log(`\n🎉 Seed Summary:`);
  console.log(`   - MongoDB: ${mongoSucceeded}/${mongoAttempted} succeeded (${mongoFailed} failed) in database "${MONGO_DB_NAME}"`);
  if (esClient) {
    console.log(`   - Elasticsearch: ${esSucceeded}/${esAttempted} succeeded (${esFailed} failed)`);
  }

  await mongoClient.close();
  if (esClient) {
    await esClient.close();
  }

  if (mongoFailed > 0 || (requireEs && esFailed > 0)) {
    console.error('❌ Seeding completed with errors.');
    process.exit(1);
  }

  return {
    mongoAttempted,
    mongoSucceeded,
    mongoFailed,
    esAttempted,
    esSucceeded,
    esFailed,
  };
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
