// service-ingestion/src/search/elasticsearch.js
const { SortOption, toJobSummary } = require('../models/job');
const { encodeCursor } = require('./query-validator');

function getEsIndex() {
  return process.env.ES_INDEX || 'jobs_index';
}

const ES_INDEX = getEsIndex();

/**
 * Ensures the Elasticsearch index exists with the appropriate mapping.
 * Non-destructive: will never automatically delete an existing populated index.
 */
async function ensureEsIndex(client, targetIndex = null) {
  if (!client) return;
  const indexName = targetIndex || getEsIndex();
  try {
    const exists = await client.indices.exists({ index: indexName });
    if (exists) {
      try {
        const mappingRes = await client.indices.getMapping({ index: indexName });
        const indexKey = Object.keys(mappingRes)[0];
        const props = mappingRes[indexKey]?.mappings?.properties || {};
        if (props.salary?.type === 'text' || !props.canonical_url) {
          console.warn(`⚠️ Elasticsearch index ${indexName} has legacy incompatible mappings. Non-destructive migration required.`);
        }
      } catch (checkErr) {
        console.warn('Warning checking index mapping:', checkErr.message);
      }
      return;
    }

    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            canonical_url: { type: 'keyword' },
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
            is_synthetic: { type: 'boolean' },
          },
        },
      },
    });
    console.log(`✅ Created Elasticsearch index: ${ES_INDEX}`);
  } catch (err) {
    console.warn(`⚠️ Elasticsearch index initialization warning:`, err.message);
  }
}

/**
 * Indexes or updates a canonical job into Elasticsearch with monotonic revision enforcement.
 * Prevents stale workers from overwriting newer documents in Elasticsearch.
 */
async function indexJobToEs(client, job, targetIndex = null) {
  if (!client || !job) return { success: false, reason: 'Client or job missing' };
  const indexName = targetIndex || getEsIndex();
  const revision = typeof job.revision === 'number' && Number.isInteger(job.revision) && job.revision > 0
    ? job.revision
    : 1;

  try {
    const res = await client.index({
      index: indexName,
      id: job.id,
      version: revision,
      version_type: 'external_gte',
      document: {
        id: job.id,
        canonical_url: job.canonical_url,
        source: job.source,
        title: job.title,
        company: job.company,
        description: job.description,
        location: job.location,
        remote_eligibility: job.remote_eligibility,
        job_type: job.job_type,
        seniority: job.seniority,
        skills: Array.isArray(job.skills) ? job.skills : [],
        salary: job.salary || null,
        status: job.status,
        published_at: job.published_at instanceof Date ? job.published_at.toISOString() : job.published_at,
        ingested_at: job.ingested_at instanceof Date ? job.ingested_at.toISOString() : job.ingested_at,
        revision: revision,
        is_synthetic: Boolean(job.is_synthetic),
      },
    });
    return { success: true, id: job.id, revision, version: res?._version ?? res?.body?._version ?? revision };
  } catch (err) {
    const isConflict =
      err.meta?.statusCode === 409 ||
      (err.name === 'ResponseError' &&
        (err.message.includes('version_conflict_engine_exception') || String(err.meta?.body).includes('version_conflict')));

    if (isConflict) {
      console.warn(
        `⚠️ Monotonic revision guard: Write rejected by Elasticsearch for job ${job.id} (revision ${revision}) due to newer existing version in search index.`
      );
      return {
        success: false,
        versionConflict: true,
        revision,
        reason: 'Newer revision already exists in search index',
      };
    }

    console.error(`⚠️ Elasticsearch indexing failed for "${job.title}":`, err.message);
    throw err;
  }
}

/**
 * Searches jobs in Elasticsearch using the unified query parameters.
 */
async function searchJobsEs(client, params) {
  const {
    q,
    location,
    remote_eligibility,
    job_type,
    seniority,
    currency,
    min_salary,
    sort,
    limit,
    decodedCursor,
  } = params;

  const mustClauses = [];
  const filterClauses = [{ term: { status: 'ACTIVE' } }];

  // 1. Keyword search (q)
  if (q) {
    mustClauses.push({
      multi_match: {
        query: q,
        fields: ['title^3', 'company^2', 'skills^1.5', 'description'],
        fuzziness: 'AUTO',
      },
    });
  }

  // 2. Location filter
  if (location) {
    filterClauses.push({
      match: {
        location: {
          query: location,
          operator: 'and',
        },
      },
    });
  }

  // 3. Enum filters
  if (remote_eligibility) {
    filterClauses.push({ term: { remote_eligibility } });
  }

  if (job_type) {
    filterClauses.push({ term: { job_type } });
  }

  if (seniority) {
    filterClauses.push({ term: { seniority } });
  }

  if (currency) {
    filterClauses.push({ term: { 'salary.currency': currency } });
  }

  if (min_salary !== undefined && min_salary !== null) {
    filterClauses.push({
      range: {
        'salary.min': { gte: min_salary },
      },
    });
  }

  // Sorting
  let esSort = [];
  if (sort === SortOption.RELEVANCE) {
    esSort = [
      { _score: { order: 'desc' } },
      { published_at: { order: 'desc' } },
      { id: { order: 'asc' } },
    ];
  } else if (sort === SortOption.SALARY_DESC) {
    esSort = [
      { 'salary.min': { order: 'desc', missing: '_last' } },
      { published_at: { order: 'desc' } },
      { id: { order: 'asc' } },
    ];
  } else {
    // DATE_DESC
    esSort = [
      { published_at: { order: 'desc' } },
      { id: { order: 'asc' } },
    ];
  }

    const searchBody = {
    index: getEsIndex(),
    size: limit + 1,
    query: {
      bool: {
        must: mustClauses.length > 0 ? mustClauses : [{ match_all: {} }],
        filter: filterClauses,
      },
    },
    sort: esSort,
    track_total_hits: true,
  };

  if (decodedCursor && Array.isArray(decodedCursor.sortValues)) {
    searchBody.search_after = decodedCursor.sortValues;
  }

  const response = await client.search(searchBody);
  const hits = response.hits.hits || [];
  const rawTotal = response.hits.total;
  const total_count = typeof rawTotal === 'number' ? rawTotal : rawTotal?.value || 0;

  const hasMore = hits.length > limit;
  const pageHits = hasMore ? hits.slice(0, limit) : hits;

  const items = pageHits.map((h) => toJobSummary(h._source));

  let next_cursor = null;
  if (hasMore && pageHits.length > 0) {
    const lastHit = pageHits[pageHits.length - 1];
    next_cursor = encodeCursor({
      v: 1,
      sort,
      q: q || '',
      sortValues: lastHit.sort,
    });
  }

  return {
    items,
    limit,
    next_cursor,
    prev_cursor: null,
    total_count,
  };
}

module.exports = {
  ES_INDEX,
  getEsIndex,
  ensureEsIndex,
  indexJobToEs,
  searchJobsEs,
};
