// service-ingestion/src/search/mongo-search.js
const { SortOption, toJobSummary } = require('../models/job');
const { encodeCursor } = require('./query-validator');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Searches jobs in MongoDB with identical filter semantics and deterministic keyset pagination.
 */
async function searchJobsMongo(jobsCollection, params) {
  if (!jobsCollection) {
    throw new Error('Database collection not available');
  }

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

  const filter = { status: 'ACTIVE' };

  // 1. Keyword search (q)
  if (q) {
    const safeRegex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { title: safeRegex },
      { company: safeRegex },
      { skills: safeRegex },
      { description: safeRegex },
    ];
  }

  // 2. Location filter
  if (location) {
    filter.location = new RegExp(escapeRegex(location), 'i');
  }

  // 3. Enum filters
  if (remote_eligibility) {
    filter.remote_eligibility = remote_eligibility;
  }

  if (job_type) {
    filter.job_type = job_type;
  }

  if (seniority) {
    filter.seniority = seniority;
  }

  if (currency) {
    filter['salary.currency'] = currency;
  }

  if (min_salary !== undefined && min_salary !== null) {
    filter['salary.min'] = { $gte: min_salary };
  }

  // Sorting
  const sortStage = {};
  if (sort === SortOption.SALARY_DESC) {
    sortStage['salary.min'] = -1;
    sortStage.published_at = -1;
    sortStage.id = 1;
  } else {
    // DATE_DESC and RELEVANCE
    sortStage.published_at = -1;
    sortStage.id = 1;
  }

  // 1. Total count for active filter BEFORE applying keyset cursor filter
  const total_count = await jobsCollection.countDocuments(filter);

  // 2. Keyset cursor filtering
  if (decodedCursor && Array.isArray(decodedCursor.sortValues)) {
    const sv = decodedCursor.sortValues;
    let cursorFilter = null;

    if (sort === SortOption.SALARY_DESC && sv.length >= 3) {
      const cursorSalary = Number(sv[0]);
      const cursorDate = new Date(sv[1]);
      const cursorId = String(sv[2]);

      cursorFilter = {
        $or: [
          { 'salary.min': { $lt: cursorSalary } },
          { 'salary.min': cursorSalary, published_at: { $lt: cursorDate } },
          { 'salary.min': cursorSalary, published_at: cursorDate, id: { $gt: cursorId } },
        ],
      };
    } else if (sv.length >= 2) {
      const cursorDate = new Date(sv[sv.length - 2]);
      const cursorId = String(sv[sv.length - 1]);

      cursorFilter = {
        $or: [
          { published_at: { $lt: cursorDate } },
          { published_at: cursorDate, id: { $gt: cursorId } },
        ],
      };
    }

    if (cursorFilter) {
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, cursorFilter];
        delete filter.$or;
      } else {
        Object.assign(filter, cursorFilter);
      }
    }
  }

  // Query limit + 1 to detect hasMore
  const docs = await jobsCollection
    .find(filter)
    .sort(sortStage)
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;
  const items = pageDocs.map(toJobSummary);

  let next_cursor = null;
  if (hasMore && pageDocs.length > 0) {
    const lastDoc = pageDocs[pageDocs.length - 1];
    const pubDate = lastDoc.published_at instanceof Date ? lastDoc.published_at : new Date(lastDoc.published_at);
    const pubEpoch = pubDate.getTime();
    const sortValues =
      sort === SortOption.SALARY_DESC
        ? [lastDoc.salary?.min || 0, pubEpoch, lastDoc.id]
        : [pubEpoch, lastDoc.id];

    next_cursor = encodeCursor({
      v: 1,
      sort,
      q: q || '',
      sortValues,
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
  searchJobsMongo,
};
