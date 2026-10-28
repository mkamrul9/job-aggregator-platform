#!/usr/bin/env node
// service-ingestion/bin/operator.js
const { MongoClient } = require('mongodb');
const { Client: EsClient } = require('@elastic/elasticsearch');
const { reconcileCatalog } = require('../src/search/reconcile');
const { rebuildIndex } = require('../src/search/reindex');
const { getDeadLetters, upsertJobDocument } = require('../src/catalog/db');
const { validateIncomingEvent } = require('../src/events/validator');
const { indexJobToEs, ES_INDEX } = require('../src/search/elasticsearch');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'job_platform';
const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);
  const jobsCollection = db.collection('jobs');
  const deadLettersCollection = db.collection('dead_letters');

  let esClient = null;
  if (ES_NODE) {
    try {
      esClient = new EsClient({ node: ES_NODE });
    } catch {}
  }

  try {
    switch (command) {
      case 'status': {
        const totalJobs = await jobsCollection.countDocuments();
        const activeJobs = await jobsCollection.countDocuments({ status: 'ACTIVE' });
        const expiredJobs = await jobsCollection.countDocuments({ status: 'EXPIRED' });
        const pendingProjection = await jobsCollection.countDocuments({ projection_status: 'PENDING' });
        const failedProjection = await jobsCollection.countDocuments({ projection_status: 'FAILED' });
        const deadLetters = await deadLettersCollection.countDocuments({ status: 'QUARANTINED' });

        let esCount = 'UNAVAILABLE';
        if (esClient) {
          try {
            const countRes = await esClient.count({ index: ES_INDEX });
            esCount = countRes.count;
          } catch (err) {
            esCount = `ERROR (${err.message})`;
          }
        }

        console.log('\n========================================');
        console.log('       SEEKERS OPERATOR STATUS          ');
        console.log('========================================');
        console.log(`Database                 : ${DB_NAME}`);
        console.log(`Total Canonical Jobs     : ${totalJobs}`);
        console.log(`- Active Listings        : ${activeJobs}`);
        console.log(`- Expired Listings       : ${expiredJobs}`);
        console.log(`Projection Outbox State  :`);
        console.log(`- Pending Projections    : ${pendingProjection}`);
        console.log(`- Failed Projections     : ${failedProjection}`);
        console.log(`Dead Letter Queue        : ${deadLetters} quarantined`);
        console.log(`Elasticsearch (${ES_INDEX}): ${esCount} documents`);
        console.log('========================================\n');
        break;
      }

      case 'dead-letters': {
        const sub = args[1] || 'list';
        if (sub === 'list') {
          const list = await getDeadLetters(deadLettersCollection, { limit: 20 });
          console.log(`\nFound ${list.length} quarantined dead letters:`);
          for (const item of list) {
            console.log(`- ID: ${item.id} | Event: ${item.event_type} | Date: ${item.quarantined_at.toISOString()}`);
            console.log(`  Errors: ${item.errors.join('; ')}`);
          }
          console.log('');
        } else if (sub === 'inspect') {
          const id = args[2];
          if (!id) {
            console.error('Usage: operator dead-letters inspect <id>');
            process.exit(1);
          }
          const item = await deadLettersCollection.findOne({ id });
          if (!item) {
            console.error(`Dead letter '${id}' not found`);
            process.exit(1);
          }
          console.log(JSON.stringify(item, null, 2));
        } else if (sub === 'replay') {
          const id = args[2];
          if (!id) {
            console.error('Usage: operator dead-letters replay <id>');
            process.exit(1);
          }
          const item = await deadLettersCollection.findOne({ id });
          if (!item) {
            console.error(`Dead letter '${id}' not found`);
            process.exit(1);
          }

          const validation = validateIncomingEvent(item.raw_payload);
          if (!validation.valid) {
            console.error(`❌ Replay rejected: event remains invalid: ${validation.errors.join('; ')}`);
            process.exit(1);
          }

          const canonical = await upsertJobDocument(jobsCollection, validation.payload);
          if (esClient) {
            try {
              await indexJobToEs(esClient, canonical);
            } catch {}
          }
          await deadLettersCollection.updateOne({ id }, { $set: { status: 'RESOLVED', resolved_at: new Date() } });
          console.log(`✅ Successfully replayed and resolved dead letter ${id} -> Canonical Job ${canonical.id}`);
        }
        break;
      }

      case 'reconcile': {
        const dryRun = args.includes('--dry-run');
        if (!esClient) {
          console.error('Reconciliation requires active Elasticsearch connection');
          process.exit(1);
        }
        console.log(`Starting catalog reconciliation (dry-run: ${dryRun})...`);
        const report = await reconcileCatalog(jobsCollection, esClient, { dryRun });
        console.log('\n--- Reconciliation Report ---');
        console.log(JSON.stringify(report, null, 2));
        break;
      }

      case 'reindex': {
        if (!esClient) {
          console.error('Reindexing requires active Elasticsearch connection');
          process.exit(1);
        }
        console.log('Initiating zero-downtime index rebuild...');
        const result = await rebuildIndex(jobsCollection, esClient);
        console.log('\n--- Reindex Result ---');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } finally {
    await mongoClient.close();
    if (esClient) {
      await esClient.close();
    }
  }
}

function printHelp() {
  console.log(`
Seekers Ingestion Operator CLI
Usage: node bin/operator.js <command> [options]

Commands:
  status                     Print catalog persistence, projection outbox, and queue metrics
  dead-letters list          List recent quarantined poison messages
  dead-letters inspect <id>  Inspect full payload and validation errors of a dead letter
  dead-letters replay <id>   Attempt idempotent replay of a quarantined dead letter
  reconcile [--dry-run]      Detect and repair missing, stale, excess, and misaligned ES docs
  reindex                    Rebuild Elasticsearch index from canonical MongoDB with atomic alias swap
`);
}

main().catch((err) => {
  console.error('Operator error:', err);
  process.exit(1);
});
