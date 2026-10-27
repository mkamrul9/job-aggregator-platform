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

  // Cursor handling
  if (decodedCursor && decodedCursor.v) {
    const v = decodedCursor.v;
    if (sort === SortOption.SALARY_DESC && v.length >= 3) {
      const cursorSalary = v[0];
      const cursorDate = new Date(v[1]);
      const cursorId = v[2];

      const cursorFilter = {
        $or: [
          { 'salary.min': { $lt: cursorSalary } },
          { 'salary.min': cursorSalary, published_at: { $lt: cursorDate } },
          { 'salary.min': cursorSalary, published_at: cursorDate, id: { $gt: cursorId } },
        ],
      };

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, cursorFilter];
        delete filter.$or;
      } else {
        Object.assign(filter, cursorFilter);
      }
    } else if (v.length >= 2) {
      const cursorDate = new Date(v[0]);
      const cursorId = v[1];

      const cursorFilter = {
        $or: [
          { published_at: { $lt: cursorDate } },
          { published_at: cursorDate, id: { $gt: cursorId } },
        ],
      };

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

  // Total count for current filter (excluding cursor filter for total count)
  const countFilter = { ...filter };
  delete countFilter.$and;
  if (filter.$and && filter.$and[0] && filter.$and[0].$or) {
    countFilter.$or = filter.$and[0].$or;
  }
  const total_count = await jobsCollection.countDocuments(countFilter);

  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;
  const items = pageDocs.map(toJobSummary);

  let next_cursor = null;
  if (hasMore && pageDocs.length > 0) {
    const lastDoc = pageDocs[pageDocs.length - 1];
    if (sort === SortOption.SALARY_DESC) {
      next_cursor = encodeCursor({
        v: [lastDoc.salary?.min || 0, new Date(lastDoc.published_at).toISOString(), lastDoc.id],
      });
    } else {
      next_cursor = encodeCursor({
        v: [new Date(lastDoc.published_at).toISOString(), lastDoc.id],
      });
    }
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
  searchJobsMongo,
};
