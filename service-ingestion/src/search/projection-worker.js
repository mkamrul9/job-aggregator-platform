// service-ingestion/src/search/projection-worker.js
const crypto = require('crypto');
const { indexJobToEs } = require('./elasticsearch');

/**
 * Projects pending canonical MongoDB documents to Elasticsearch.
 * Enforces search-side monotonic revision enforcement, safe lease claiming,
 * bounded exponential backoff, and optimistic concurrency control.
 */
async function projectPendingJobs(jobsCollection, esClient, { batchSize = 50, targetIndex = null } = {}) {
  if (!jobsCollection || !esClient) {
    return { attempted: 0, projected: 0, failed: 0, conflicts: 0 };
  }

  const workerId = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const leaseDurationMs = 30000;
  const leaseExpires = new Date(now.getTime() + leaseDurationMs);

  let attempted = 0;
  let projected = 0;
  let failed = 0;
  let conflicts = 0;

  try {
    // 1. Query for pending, failed, or expired-lease documents that are due for projection attempt
    const query = {
      $or: [
        {
          projection_status: { $in: ['PENDING', 'FAILED'] },
          $or: [
            { projection_next_attempt_at: { $exists: false } },
            { projection_next_attempt_at: { $lte: now } },
          ],
        },
        {
          projection_status: 'CLAIMED',
          projection_lease_until: { $lte: now }, // Expired lease recovery
        },
      ],
    };

    const processJob = async (job) => {
      attempted += 1;
      const revision = job.revision || 1;

      try {
        const indexRes = await indexJobToEs(esClient, job, targetIndex);

        if (indexRes && indexRes.versionConflict) {
          // Monotonic guard: Elasticsearch already contains a newer revision!
          conflicts += 1;
          console.warn(`ℹ️ Version conflict for job ${job.id}: search index is newer than revision ${revision}.`);

          // Release lease without failing
          if (typeof jobsCollection.updateOne === 'function') {
            await jobsCollection.updateOne(
              { _id: job._id, ...(job.projection_claimed_by ? { projection_claimed_by: workerId } : {}) },
              {
                $set: {
                  projection_status: 'INDEXED',
                  projection_lease_until: null,
                  projection_claimed_by: null,
                },
              }
            );
          }
          return;
        }

        // Successfully written to Elasticsearch: update Mongo with concurrency guard
        if (typeof jobsCollection.updateOne === 'function') {
          const updateRes = await jobsCollection.updateOne(
            {
              _id: job._id,
              revision: revision,
              ...(job.projection_claimed_by ? { projection_claimed_by: workerId } : {}) },
            {
              $set: {
                projection_status: 'INDEXED',
                projection_version: revision,
                projected_at: new Date(),
                last_projection_error: null,
                projection_lease_until: null,
                projection_claimed_by: null,
                projection_retry_count: 0,
              },
            }
          );

          if (updateRes.matchedCount > 0) {
            projected += 1;
          } else {
            console.log(`ℹ️ Document ${job.id} revision advanced during indexing. Retrying next cycle.`);
          }
        } else {
          projected += 1;
        }
      } catch (esErr) {
        failed += 1;
        const retryCount = (job.projection_retry_count || 0) + 1;
        const backoffMs = Math.min(60000, 1000 * Math.pow(2, Math.min(retryCount, 6))); // Exponential backoff up to 1m

        if (typeof jobsCollection.updateOne === 'function') {
          await jobsCollection.updateOne(
            { _id: job._id },
            {
              $set: {
                projection_status: 'FAILED',
                projection_retry_count: retryCount,
                projection_next_attempt_at: new Date(Date.now() + backoffMs),
                last_projection_error: esErr.message,
                last_projection_attempt: new Date(),
                projection_lease_until: null,
                projection_claimed_by: null,
              },
            }
          );
        }
      }
    };

    if (typeof jobsCollection.findOneAndUpdate === 'function') {
      // Find candidate IDs first
      const candidateDocs = await jobsCollection
        .find(query)
        .sort({ published_at: -1 })
        .limit(batchSize)
        .toArray();

      const jobsToProcess = [];
      for (const candidate of candidateDocs) {
        // Atomically claim the document with lease
        const claimed = await jobsCollection.findOneAndUpdate(
          {
            _id: candidate._id,
            revision: candidate.revision,
            $or: [
              { projection_status: { $in: ['PENDING', 'FAILED'] } },
              { projection_status: 'CLAIMED', projection_lease_until: { $lte: now } },
            ],
          },
          {
            $set: {
              projection_status: 'CLAIMED',
              projection_lease_until: leaseExpires,
              projection_claimed_by: workerId,
            },
          },
          { returnDocument: 'after' }
        );

        const doc = claimed?.value || claimed;
        if (doc && doc._id) {
          jobsToProcess.push(doc);
        }
      }

      for (const job of jobsToProcess) {
        await processJob(job);
      }
    } else if (typeof jobsCollection.find === 'function') {
      // Fallback for mock environments
      let cursor = jobsCollection.find({ projection_status: { $in: ['PENDING', 'FAILED'] } });
      if (typeof cursor.sort === 'function') {
        cursor = cursor.sort({ published_at: -1 });
      }
      if (typeof cursor.limit === 'function') {
        cursor = cursor.limit(batchSize);
      }
      if (typeof cursor.toArray === 'function') {
        const docs = await cursor.toArray();
        for (const doc of docs) {
          await processJob(doc);
        }
      } else {
        while (await cursor.hasNext()) {
          const doc = await cursor.next();
          if (!doc) break;
          await processJob(doc);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Warning during projection outbox batch:', err.message);
  }

  return { attempted, projected, failed, conflicts };
}

/**
 * Starts a background projection outbox worker loop with bounded shutdown.
 */
function startProjectionWorker(jobsCollection, esClient, { intervalMs = 10000, batchSize = 50, targetIndex = null } = {}) {
  let isRunning = false;
  let activeExecution = null;
  let isStopping = false;

  const runTick = async () => {
    if (isRunning || isStopping) return;
    isRunning = true;
    try {
      activeExecution = projectPendingJobs(jobsCollection, esClient, { batchSize, targetIndex });
      await activeExecution;
    } catch (err) {
      console.warn('⚠️ Projection worker tick error:', err.message);
    } finally {
      activeExecution = null;
      isRunning = false;
    }
  };

  const timer = setInterval(runTick, intervalMs);

  return {
    async stop(timeoutMs = 5000) {
      isStopping = true;
      clearInterval(timer);
      if (activeExecution) {
        await Promise.race([
          activeExecution,
          new Promise((resolve) => setTimeout(resolve, timeoutMs)),
        ]);
      }
    },
    tickNow: () => projectPendingJobs(jobsCollection, esClient, { batchSize, targetIndex }),
  };
}

module.exports = {
  projectPendingJobs,
  startProjectionWorker,
};
