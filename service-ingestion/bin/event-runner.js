#!/usr/bin/env node
// service-ingestion/bin/event-runner.js
const fs = require('fs');
const readline = require('readline');
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const { validateIncomingEvent } = require('../src/events/validator');
const { upsertJobDocument, quarantineDeadLetter, ensureMongoIndexes } = require('../src/catalog/db');
const { indexJobToEs, ensureEsIndex } = require('../src/search/elasticsearch');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'job_platform';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';

async function main() {
  const args = process.argv.slice(2);
  let filePath = null;
  let useStdin = false;
  let isDryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      filePath = arg.split('=')[1];
    } else if (arg === '--stdin') {
      useStdin = true;
    } else if (arg === '--dry-run') {
      isDryRun = true;
    }
  }

  if (!filePath && !useStdin) {
    console.error('Usage: node bin/event-runner.js (--file=<path> | --stdin) [--dry-run]');
    process.exit(1);
  }

  console.log(`[Event-Runner] Initializing (file: ${filePath || 'stdin'}, dry-run: ${isDryRun})`);

  let mongoClient = null;
  let jobsCollection = null;
  let deadLettersCollection = null;
  let esClient = null;

  if (!isDryRun) {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db(DB_NAME);
    jobsCollection = db.collection('jobs');
    deadLettersCollection = db.collection('dead_letters');
    await ensureMongoIndexes(jobsCollection, deadLettersCollection);
    console.log(`[Event-Runner] Connected to MongoDB database: ${DB_NAME}`);

    if (ES_NODE) {
      try {
        esClient = new EsClient({ node: ES_NODE });
        await ensureEsIndex(esClient);
        console.log(`[Event-Runner] Connected to Elasticsearch at: ${ES_NODE}`);
      } catch (err) {
        console.warn(`[Event-Runner] Elasticsearch unavailable: ${err.message}. Operating in MongoDB-only mode.`);
      }
    }
  }

  let inputStream;
  if (useStdin) {
    inputStream = process.stdin;
  } else {
    if (!fs.existsSync(filePath)) {
      console.error(`[Event-Runner] File not found: ${filePath}`);
      process.exit(1);
    }
    inputStream = fs.createReadStream(filePath);
  }

  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  const stats = {
    total: 0,
    ingested_new: 0,
    updated: 0,
    unchanged_duplicate: 0,
    quarantined: 0,
    projected: 0,
    es_failed: 0,
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    stats.total += 1;
    const validation = validateIncomingEvent(trimmed);

    if (!validation.valid) {
      stats.quarantined += 1;
      console.log(`[Event-Runner] ⚠️ Poison/Malformed Event quarantined: ${validation.errors.join('; ')}`);
      if (!isDryRun && deadLettersCollection) {
        await quarantineDeadLetter(deadLettersCollection, trimmed, validation.errors, validation.parsed);
      }
      continue;
    }

    if (isDryRun) {
      console.log(`[Event-Runner] [DRY RUN] Valid event: "${validation.payload.title}" from ${validation.payload.source}`);
      continue;
    }

    try {
      const canonical = await upsertJobDocument(jobsCollection, validation.payload);

      if (canonical.is_new) {
        stats.ingested_new += 1;
        console.log(`[Event-Runner] 💾 Persisted NEW canonical job: "${canonical.title}" [${canonical.id}]`);
      } else if (canonical.is_updated) {
        stats.updated += 1;
        console.log(`[Event-Runner] 🔄 Updated canonical job: "${canonical.title}" (rev: ${canonical.revision})`);
      } else {
        stats.unchanged_duplicate += 1;
        console.log(`[Event-Runner] 🔁 Duplicate replay (noop): "${canonical.title}"`);
      }

      // Project to Elasticsearch if available
      if (esClient) {
        try {
          await indexJobToEs(esClient, canonical);
          await jobsCollection.updateOne(
            { _id: canonical._id || undefined, id: canonical.id },
            { $set: { projection_status: 'INDEXED', projection_version: canonical.revision } }
          );
          stats.projected += 1;
        } catch (esErr) {
          stats.es_failed += 1;
          console.warn(`[Event-Runner] ⚠️ ES Projection failed for ${canonical.id}: ${esErr.message}`);
        }
      }
    } catch (ingestErr) {
      console.error(`[Event-Runner] ❌ Database error: ${ingestErr.message}`);
      process.exit(1);
    }
  }

  console.log('\n========================================');
  console.log('         EVENT RUNNER SUMMARY           ');
  console.log('========================================');
  console.log(`Total Events Processed : ${stats.total}`);
  console.log(`New Canonical Ingested : ${stats.ingested_new}`);
  console.log(`Updated Jobs           : ${stats.updated}`);
  console.log(`Unchanged Duplicates   : ${stats.unchanged_duplicate}`);
  console.log(`Quarantined Poison     : ${stats.quarantined}`);
  console.log(`Elasticsearch Projected: ${stats.projected}`);
  if (stats.es_failed > 0) {
    console.log(`ES Projection Failed   : ${stats.es_failed}`);
  }
  console.log('========================================\n');

  if (mongoClient) {
    await mongoClient.close();
  }
  if (esClient) {
    await esClient.close();
  }
}

main().catch((err) => {
  console.error('[Event-Runner] Fatal Error:', err);
  process.exit(1);
});
