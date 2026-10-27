// service-ingestion/src/search/elasticsearch.js
const { SortOption, toJobSummary } = require('../models/job');
const { encodeCursor } = require('./query-validator');

const ES_INDEX = process.env.ES_INDEX || 'jobs_index';

/**
 * Ensures the Elasticsearch index exists with the appropriate mapping.
 */
async function ensureEsIndex(client) {
  if (!client) return;
  try {
    let exists = await client.indices.exists({ index: ES_INDEX });
    if (exists) {
      try {
        const mappingRes = await client.indices.getMapping({ index: ES_INDEX });
        const indexKey = Object.keys(mappingRes)[0];
        const props = mappingRes[indexKey]?.mappings?.properties || {};
        if (props.salary?.type === 'text' || !props.canonical_url) {
          console.log(`♻️ Recreating legacy Elasticsearch index ${ES_INDEX} with canonical mappings...`);
          await client.indices.delete({ index: ES_INDEX });
          exists = false;
        }
      } catch (checkErr) {
        console.warn('Warning checking index mapping:', checkErr.message);
      }
    }
    if (!exists) {
      await client.indices.create({
        index: ES_INDEX,
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
                },
              },
              status: { type: 'keyword' },
              published_at: { type: 'date' },
              ingested_at: { type: 'date' },
            },
          },
        },
      });
      console.log(`✅ Created Elasticsearch index: ${ES_INDEX}`);
    }
  } catch (err) {
    console.warn(`⚠️ Elasticsearch index initialization warning:`, err.message);
  }
}

/**
 * Indexes or updates a canonical job into Elasticsearch.
 */
async function indexJobToEs(client, job) {
  if (!client || !job) return;
  try {
    await client.index({
      index: ES_INDEX,
      id: job.id,
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
        skills: job.skills,
        salary: job.salary || null,
        status: job.status,
        published_at: job.published_at instanceof Date ? job.published_at.toISOString() : job.published_at,
        ingested_at: job.ingested_at instanceof Date ? job.ingested_at.toISOString() : job.ingested_at,
      },
    });
  } catch (err) {
    console.error(`⚠️ Elasticsearch indexing failed for "${job.title}":`, err.message);
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
    index: ES_INDEX,
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
    next_cursor = encodeCursor({ sortValues: lastHit.sort });
  }

  return {
    items,
    limit,
    next_cursor,
    prev_cursor: decodedCursor ? 'prev_supported' : null,
    total_count,
  };
}

module.exports = {
  ES_INDEX,
  ensureEsIndex,
  indexJobToEs,
  searchJobsEs,
};
