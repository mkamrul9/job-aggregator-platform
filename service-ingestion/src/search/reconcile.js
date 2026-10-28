// service-ingestion/src/search/reconcile.js
const { indexJobToEs } = require('./elasticsearch');
const { hasContentChanged } = require('../catalog/db');

/**
 * Reconciles the authoritative canonical MongoDB jobs catalog against the Elasticsearch projection.
 * Detects and repairs:
 * 1. Missing documents (in Mongo, absent in ES)
 * 2. Stale documents (in ES, but Mongo has newer revision or changed content/status/salary/skills)
 * 3. Excess documents (in ES, but absent in Mongo) across complete paginated index
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
    const mongoCursor = typeof jobsCollection.find === 'function'
      ? jobsCollection.find({}).batchSize ? jobsCollection.find({}).batchSize(batchSize) : jobsCollection.find({})
      : null;

    if (mongoCursor) {
      while (await mongoCursor.hasNext()) {
        const job = await mongoCursor.next();
        report.scanned_mongo += 1;

        try {
          let esDoc = null;
          try {
            const getRes = await esClient.get({ index: targetIndex, id: job.id });
            esDoc = getRes._source || getRes.body?._source || null;
          } catch (err) {
            const statusCode = err.meta?.statusCode || err.statusCode || (err.message?.includes('404') ? 404 : null);
            if (statusCode === 404 || err.name === 'NotFoundError') {
              esDoc = null; // Genuinely absent
            } else {
              // Real server, network, or authorization error - fail truthfully
              throw new Error(`Elasticsearch lookup failed for job ${job.id}: ${err.message}`);
            }
          }

          if (!esDoc) {
            // Missing in ES
            report.missing_indexed += 1;
            if (!dryRun) {
              await indexJobToEs(esClient, job, targetIndex);
              if (typeof jobsCollection.updateOne === 'function') {
                await jobsCollection.updateOne(
                  { _id: job._id, revision: job.revision || 1 },
                  { $set: { projection_status: 'INDEXED', projection_version: job.revision || 1 } }
                );
              }
            }
          } else {
            // Exists in ES: compare all canonical fields and revision
            const statusMismatch = esDoc.status !== job.status;
            const revisionMismatch =
              typeof esDoc.revision === 'number' &&
              typeof job.revision === 'number' &&
              esDoc.revision !== job.revision;
            const contentMismatch = hasContentChanged(esDoc, job);

            if (statusMismatch) {
              report.status_aligned += 1;
              if (!dryRun) {
                await indexJobToEs(esClient, job, targetIndex);
                if (typeof jobsCollection.updateOne === 'function') {
                  await jobsCollection.updateOne(
                    { _id: job._id, revision: job.revision || 1 },
                    { $set: { projection_status: 'INDEXED', projection_version: job.revision || 1 } }
                  );
                }
              }
            } else if (revisionMismatch || contentMismatch) {
              report.stale_updated += 1;
              if (!dryRun) {
                await indexJobToEs(esClient, job, targetIndex);
                if (typeof jobsCollection.updateOne === 'function') {
                  await jobsCollection.updateOne(
                    { _id: job._id, revision: job.revision || 1 },
                    { $set: { projection_status: 'INDEXED', projection_version: job.revision || 1 } }
                  );
                }
              }
            }
          }
        } catch (docErr) {
          report.errors.push({ id: job.id, error: docErr.message });
        }
      }
    }

    // 2. Scan Elasticsearch across ALL pages (search_after) to find excess documents not in Mongo
    try {
      let searchAfter = undefined;
      const pageSize = 500;
      let hasMore = true;

      while (hasMore) {
        const searchParams = {
          index: targetIndex,
          size: pageSize,
          query: { match_all: {} },
          sort: [{ id: 'asc' }],
          _source: ['id'],
        };
        if (searchAfter) {
          searchParams.search_after = searchAfter;
        }

        const searchRes = await esClient.search(searchParams);
        const hits = searchRes.hits?.hits || searchRes.body?.hits?.hits || [];
        report.scanned_es += hits.length;

        if (hits.length === 0) {
          break;
        }

        for (const hit of hits) {
          const hitId = hit._source?.id || hit._id;
          const mongoExists = typeof jobsCollection.findOne === 'function'
            ? await jobsCollection.findOne({ id: hitId })
            : null;

          if (!mongoExists) {
            report.excess_deleted += 1;
            if (!dryRun) {
              await esClient.delete({ index: targetIndex, id: hit._id });
            }
          }
        }

        if (hits.length < pageSize || !hits[hits.length - 1].sort) {
          break;
        }
        searchAfter = hits[hits.length - 1].sort;
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
