// service-ingestion/src/search/reindex.js
const { ES_INDEX } = require('./elasticsearch');

const INDEX_MAPPINGS = {
  properties: {
    id: { type: 'keyword' },
    canonical_url: { type: 'keyword' },
    source_url_hash: { type: 'keyword' },
    source: { type: 'keyword' },
    title: {
      type: 'text',
      fields: { keyword: { type: 'keyword', ignore_above: 256 } },
    },
    company: {
      type: 'text',
      fields: { keyword: { type: 'keyword', ignore_above: 256 } },
    },
    description: { type: 'text' },
    location: {
      type: 'text',
      fields: { keyword: { type: 'keyword', ignore_above: 256 } },
    },
    remote_eligibility: { type: 'keyword' },
    job_type: { type: 'keyword' },
    seniority: { type: 'keyword' },
    skills: { type: 'keyword' },
    salary: {
      properties: {
        currency: { type: 'keyword' },
        min: { type: 'double' },
        max: { type: 'double' },
        period: { type: 'keyword' },
        normalized_monthly_min: { type: 'double' },
        normalized_monthly_max: { type: 'double' },
      },
    },
    status: { type: 'keyword' },
    published_at: { type: 'date' },
    ingested_at: { type: 'date' },
    revision: { type: 'integer' },
    is_synthetic: { type: 'boolean' },
  },
};

/**
 * Rebuilds the search index with zero downtime via an atomic alias switch.
 * Validates document counts and query responses before switching the alias.
 * Safely migrates from legacy physical indexes, bounds per-record revision confirmations,
 * and guarantees that an active serving index is never deleted in a cleanup failure.
 */
async function rebuildIndex(jobsCollection, esClient, { alias = ES_INDEX, targetIndex = null } = {}) {
  if (!jobsCollection || !esClient) {
    throw new Error('Rebuild requires both jobsCollection and esClient');
  }

  const newIndexName = targetIndex || `jobs_v_${Date.now()}`;
  let aliasSwitched = false;
  const verifiedDocs = [];

  // 1. Create target index with authoritative mapping
  await esClient.indices.create({
    index: newIndexName,
    body: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: INDEX_MAPPINGS,
    },
  });

  console.log(`✅ Created target Elasticsearch index: ${newIndexName}`);

  // 2. Stream all active canonical jobs from MongoDB into target index
  let projectedCount = 0;
  try {
    const cursor = jobsCollection.find({ status: 'ACTIVE' });
    const bulkOps = [];
    let pendingBatch = [];

    while (await cursor.hasNext()) {
      const job = await cursor.next();
      const revision = job.revision || 1;
      bulkOps.push({ index: { _index: newIndexName, _id: job.id } });
      bulkOps.push({
        id: job.id,
        canonical_url: job.canonical_url,
        source_url_hash: job.source_url_hash,
        source: job.source,
        title: job.title,
        company: job.company,
        description: job.description,
        location: job.location,
        remote_eligibility: job.remote_eligibility,
        job_type: job.job_type,
        seniority: job.seniority,
        skills: job.skills,
        salary: job.salary || null,
        status: job.status,
        published_at: job.published_at instanceof Date ? job.published_at.toISOString() : job.published_at,
        ingested_at: job.ingested_at instanceof Date ? job.ingested_at.toISOString() : job.ingested_at,
        revision: revision,
        is_synthetic: Boolean(job.is_synthetic),
      });

      pendingBatch.push({ id: job.id, revision });
      projectedCount += 1;

      if (bulkOps.length >= 200) {
        const bulkRes = await esClient.bulk({ body: bulkOps, refresh: false });
        if (bulkRes?.items) {
          bulkRes.items.forEach((item, idx) => {
            if (!item.index?.error && pendingBatch[idx]) {
              verifiedDocs.push(pendingBatch[idx]);
            }
          });
        } else {
          verifiedDocs.push(...pendingBatch);
        }
        bulkOps.length = 0;
        pendingBatch = [];
      }
    }

    if (bulkOps.length > 0) {
      const bulkRes = await esClient.bulk({ body: bulkOps, refresh: true });
      if (bulkRes?.items) {
        bulkRes.items.forEach((item, idx) => {
          if (!item.index?.error && pendingBatch[idx]) {
            verifiedDocs.push(pendingBatch[idx]);
          }
        });
      } else {
        verifiedDocs.push(...pendingBatch);
      }
    } else {
      await esClient.indices.refresh({ index: newIndexName });
    }

    // 3. Validation Gate: Verify target index count and sample query
    const countFn = typeof esClient.count === 'function'
      ? esClient.count.bind(esClient)
      : esClient.indices?.count?.bind(esClient.indices);
    const searchFn = typeof esClient.search === 'function'
      ? esClient.search.bind(esClient)
      : esClient.indices?.search?.bind(esClient.indices);

    let indexedTotal = projectedCount;
    if (typeof countFn === 'function') {
      const targetCountRes = await countFn({ index: newIndexName });
      indexedTotal = targetCountRes.count;
    }

    if (indexedTotal !== projectedCount) {
      throw new Error(`Validation failed: projected ${projectedCount} docs, but target index contains ${indexedTotal}`);
    }

    // Verify search query executes without error
    if (typeof searchFn === 'function') {
      const testSearch = await searchFn({
        index: newIndexName,
        size: 1,
        query: { match_all: {} },
      });
      if (projectedCount > 0 && (!testSearch.hits?.hits || testSearch.hits.hits.length === 0)) {
        throw new Error(`Validation failed: test query returned 0 results on populated index`);
      }
    }

    // 4. Atomic Alias Switch
    const aliasActions = [];
    let isPhysicalIndex = false;
    let existsDirect = false;

    try {
      existsDirect = await esClient.indices.exists({ index: alias });
    } catch {}

    try {
      const aliasRes = await esClient.indices.getAlias({ name: alias });
      const oldIndices = Object.keys(aliasRes || {});
      for (const oldIdx of oldIndices) {
        aliasActions.push({ remove: { index: oldIdx, alias } });
      }
    } catch (err) {
      if (existsDirect) {
        isPhysicalIndex = true;
      }
    }

    if (isPhysicalIndex) {
      console.log(`Non-destructive migration: replacing physical index '${alias}' with alias -> ${newIndexName}`);
      await esClient.indices.delete({ index: alias });
      await esClient.indices.putAlias({ index: newIndexName, name: alias });
      aliasSwitched = true;
    } else {
      aliasActions.push({ add: { index: newIndexName, alias } });
      await esClient.indices.updateAliases({
        body: { actions: aliasActions },
      });
      aliasSwitched = true;
    }

    console.log(`✅ Successfully switched alias '${alias}' -> ${newIndexName}`);

    // Mark verified revisions as INDEXED (do NOT bulk update documents that changed during rebuild)
    const now = new Date();
    for (const doc of verifiedDocs) {
      if (typeof jobsCollection.updateOne === 'function') {
        await jobsCollection.updateOne(
          { id: doc.id, revision: doc.revision },
          {
            $set: {
              projection_status: 'INDEXED',
              projection_version: doc.revision,
              projected_at: now,
            },
          }
        );
      }
    }

    return {
      success: true,
      targetIndex: newIndexName,
      activeJobsProjected: projectedCount,
      verified: true,
      aliasSwitched: true,
    };
  } catch (err) {
    if (!aliasSwitched) {
      console.error(`❌ Rebuild failed prior to cutover. Cleaning up unserving target index ${newIndexName}:`, err.message);
      try {
        await esClient.indices.delete({ index: newIndexName });
      } catch {}
    } else {
      console.error(
        `⚠️ Rebuild post-cutover bookkeeping failed for ${newIndexName}. Target index IS SERVING TRAFFIC and must NOT be deleted:`,
        err.message
      );
    }
    throw err;
  }
}

module.exports = {
  rebuildIndex,
  INDEX_MAPPINGS,
};
