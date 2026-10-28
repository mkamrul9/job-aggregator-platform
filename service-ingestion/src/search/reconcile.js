// service-ingestion/src/search/reconcile.js
const { indexJobToEs } = require('./elasticsearch');

/**
 * Reconciles the authoritative canonical MongoDB jobs catalog against the Elasticsearch projection.
 * Detects and repairs:
 * 1. Missing documents (in Mongo, absent in ES)
 * 2. Stale documents (in ES, but Mongo has newer revision)
 * 3. Excess documents (in ES, but absent in Mongo)
 * 4. Incorrectly active documents (status in ES disagrees with Mongo)
 */
async function reconcileCatalog(jobsCollection, esClient, { dryRun = false, batchSize = 100, index = null } = {}) {
  if (!jobsCollection || !esClient) {
    throw new Error('Reconciliation requires both jobsCollection and esClient');
  }

  const targetIndex = index || process.env.ES_INDEX || 'jobs_index';

  const report = {
    scanned_mongo: 0,
    scanned_es: 0,
    missing_indexed: 0,
    stale_updated: 0,
    excess_deleted: 0,
    status_aligned: 0,
    dry_run: Boolean(dryRun),
    errors: [],
  };

  try {
    // 1. Scan all MongoDB documents and check ES
    const mongoCursor = jobsCollection.find({}).batchSize(batchSize);

    while (await mongoCursor.hasNext()) {
      const job = await mongoCursor.next();
      report.scanned_mongo += 1;

      try {
        let esDoc = null;
        try {
          const getRes = await esClient.get({ index: targetIndex, id: job.id });
          esDoc = getRes._source;
        } catch (err) {
          if (err.meta?.statusCode !== 404 && err.name !== 'ResponseError') {
            throw err;
          }
        }

        if (!esDoc) {
          // Missing in ES
          report.missing_indexed += 1;
          if (!dryRun) {
            await indexJobToEs(esClient, job, targetIndex);
            await jobsCollection.updateOne(
              { _id: job._id },
              { $set: { projection_status: 'INDEXED', projection_version: job.revision || 1 } }
            );
          }
        } else {
          // Exists in ES: check if status differs or if stale
          const statusMismatch = esDoc.status !== job.status;
          const contentMismatch = esDoc.title !== job.title || esDoc.description !== job.description;

          if (statusMismatch) {
            report.status_aligned += 1;
            if (!dryRun) {
              await indexJobToEs(esClient, job, targetIndex);
              await jobsCollection.updateOne(
                { _id: job._id },
                { $set: { projection_status: 'INDEXED', projection_version: job.revision || 1 } }
              );
            }
          } else if (contentMismatch) {
            report.stale_updated += 1;
            if (!dryRun) {
              await indexJobToEs(esClient, job, targetIndex);
              await jobsCollection.updateOne(
                { _id: job._id },
                { $set: { projection_status: 'INDEXED', projection_version: job.revision || 1 } }
              );
            }
          }
        }
      } catch (docErr) {
        report.errors.push({ id: job.id, error: docErr.message });
      }
    }

    // 2. Scan Elasticsearch to find excess documents not in Mongo
    try {
      const searchRes = await esClient.search({
        index: targetIndex,
        size: 500,
        query: { match_all: {} },
        _source: ['id'],
      });

      const hits = searchRes.hits?.hits || [];
      report.scanned_es = hits.length;

      for (const hit of hits) {
        const mongoExists = await jobsCollection.findOne({ id: hit._id });
        if (!mongoExists) {
          report.excess_deleted += 1;
          if (!dryRun) {
            await esClient.delete({ index: targetIndex, id: hit._id });
          }
        }
      }
    } catch (esSearchErr) {
      report.errors.push({ stage: 'es_excess_scan', error: esSearchErr.message });
    }
  } catch (fatalErr) {
    report.errors.push({ fatal: fatalErr.message });
  }

  return report;
}

module.exports = {
  reconcileCatalog,
};
