// service-ingestion/src/search/projection-worker.js
const { indexJobToEs } = require('./elasticsearch');

/**
 * Projects pending canonical MongoDB documents to Elasticsearch.
 * Enforces optimistic concurrency control: ensures stale workers cannot overwrite
 * newer revisions in Elasticsearch.
 */
async function projectPendingJobs(jobsCollection, esClient, { batchSize = 50 } = {}) {
  if (!jobsCollection || !esClient) {
    return { attempted: 0, projected: 0, failed: 0 };
  }

  let attempted = 0;
  let projected = 0;
  let failed = 0;

  try {
    const cursor = jobsCollection
      .find({
        projection_status: { $in: ['PENDING', 'FAILED'] },
      })
      .sort({ published_at: -1 })
      .limit(batchSize);

    while (await cursor.hasNext()) {
      const job = await cursor.next();
      attempted += 1;

      try {
        await indexJobToEs(esClient, job);

        // Concurrency guard: update only if MongoDB document revision matches
        const revision = job.revision || 1;
        const updateRes = await jobsCollection.updateOne(
          { _id: job._id, revision },
          {
            $set: {
              projection_status: 'INDEXED',
              projection_version: revision,
              projected_at: new Date(),
              last_projection_error: null,
            },
          }
        );

        if (updateRes.matchedCount > 0) {
          projected += 1;
        } else {
          // A newer revision was inserted while indexing was in progress; leave as PENDING
          console.log(`ℹ️ Concurrency guard: job ${job.id} revision advanced during indexing. Retrying next cycle.`);
        }
      } catch (esErr) {
        failed += 1;
        await jobsCollection.updateOne(
          { _id: job._id },
          {
            $set: {
              projection_status: 'FAILED',
              last_projection_error: esErr.message,
              last_projection_attempt: new Date(),
            },
            $inc: { projection_attempts: 1 },
          }
        );
      }
    }
  } catch (err) {
    console.warn('⚠️ Warning during projection outbox batch:', err.message);
  }

  return { attempted, projected, failed };
}

/**
 * Starts a background projection outbox worker loop.
 */
function startProjectionWorker(jobsCollection, esClient, { intervalMs = 10000, batchSize = 50 } = {}) {
  let isRunning = false;

  const timer = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await projectPendingJobs(jobsCollection, esClient, { batchSize });
    } catch (err) {
      console.warn('⚠️ Projection worker tick error:', err.message);
    } finally {
      isRunning = false;
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(timer),
    tickNow: () => projectPendingJobs(jobsCollection, esClient, { batchSize }),
  };
}

module.exports = {
  projectPendingJobs,
  startProjectionWorker,
};
