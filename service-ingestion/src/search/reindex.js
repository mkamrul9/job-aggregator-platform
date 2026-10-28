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
 */
async function rebuildIndex(jobsCollection, esClient, { alias = ES_INDEX, targetIndex = null } = {}) {
  if (!jobsCollection || !esClient) {
    throw new Error('Rebuild requires both jobsCollection and esClient');
  }

  const newIndexName = targetIndex || `jobs_v_${Date.now()}`;

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

    while (await cursor.hasNext()) {
      const job = await cursor.next();
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
        revision: job.revision || 1,
        is_synthetic: Boolean(job.is_synthetic),
      });

      projectedCount += 1;

      if (bulkOps.length >= 200) {
        await esClient.bulk({ body: bulkOps, refresh: false });
        bulkOps.length = 0;
      }
    }

    if (bulkOps.length > 0) {
      await esClient.bulk({ body: bulkOps, refresh: true });
    } else {
      await esClient.indices.refresh({ index: newIndexName });
    }

    // 3. Validation Gate: Verify target index count and sample query
    const targetCountRes = await esClient.count({ index: newIndexName });
    const indexedTotal = targetCountRes.count;

    if (indexedTotal !== projectedCount) {
      throw new Error(`Validation failed: projected ${projectedCount} docs, but target index contains ${indexedTotal}`);
    }

    // Verify search query executes without error
    const testSearch = await esClient.search({
      index: newIndexName,
      size: 1,
      query: { match_all: {} },
    });
    if (projectedCount > 0 && (!testSearch.hits?.hits || testSearch.hits.hits.length === 0)) {
      throw new Error(`Validation failed: test query returned 0 results on populated index`);
    }

    // 4. Atomic Alias Switch
    // Determine existing indices pointing to alias
    const aliasActions = [];
    try {
      const aliasRes = await esClient.indices.getAlias({ name: alias });
      const oldIndices = Object.keys(aliasRes);
      for (const oldIdx of oldIndices) {
        aliasActions.push({ remove: { index: oldIdx, alias } });
      }
    } catch (err) {
      // Alias might not exist yet if previously an index existed with that exact name
      const existsDirect = await esClient.indices.exists({ index: alias });
      if (existsDirect) {
        console.warn(`⚠️ Warning: '${alias}' is currently a physical index. Non-alias migration required.`);
      }
    }

    aliasActions.push({ add: { index: newIndexName, alias } });

    await esClient.indices.updateAliases({
      body: { actions: aliasActions },
    });

    console.log(`✅ Atomically updated alias '${alias}' -> ${newIndexName}`);

    // Mark MongoDB canonical documents as INDEXED
    await jobsCollection.updateMany(
      { status: 'ACTIVE' },
      { $set: { projection_status: 'INDEXED' } }
    );

    return {
      success: true,
      targetIndex: newIndexName,
      activeJobsProjected: projectedCount,
      verified: true,
    };
  } catch (err) {
    console.error(`❌ Rebuild failed. Cleaning up failed target index ${newIndexName}:`, err.message);
    try {
      await esClient.indices.delete({ index: newIndexName });
    } catch {}
    throw err;
  }
}

module.exports = {
  rebuildIndex,
  INDEX_MAPPINGS,
};
