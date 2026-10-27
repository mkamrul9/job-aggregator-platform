// service-ingestion/src/search/query-validator.js
const {
  RemoteEligibility,
  JobType,
  Seniority,
  Currency,
  SortOption,
} = require('../models/job');

/**
 * Standard RFC 7807 Problem Details Error Builder
 */
function createProblemDetails({ type, title, status = 400, detail, instance }) {
  return {
    type: type || `https://errors.seekers.internal/problem/${status}`,
    title,
    status,
    detail,
    instance: instance || undefined,
    error: detail || title,
  };
}

/**
 * Encodes an opaque keyset pagination cursor.
 */
function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decodes and validates an opaque keyset pagination cursor.
 */
function decodeCursor(cursorStr) {
  if (!cursorStr || typeof cursorStr !== 'string') return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Cursor must be a JSON object');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid pagination cursor: ${err.message}`);
  }
}

/**
 * Validates and extracts search query parameters from express request.
 * Returns { valid: true, params } or { valid: false, error: ProblemDetails }
 */
function validateSearchParams(query, reqUrl = '/api/v1/jobs') {
  const errors = [];

  // 1. Keyword search (q)
  let q = undefined;
  if (query.q !== undefined && query.q !== null && query.q !== '') {
    if (typeof query.q !== 'string') {
      errors.push('Parameter "q" must be a string');
    } else if (query.q.length > 100) {
      errors.push('Parameter "q" must not exceed 100 characters');
    } else {
      q = query.q.trim();
    }
  }

  // 2. Location filter
  let location = undefined;
  if (query.location !== undefined && query.location !== null && query.location !== '') {
    if (typeof query.location !== 'string') {
      errors.push('Parameter "location" must be a string');
    } else if (query.location.length > 100) {
      errors.push('Parameter "location" must not exceed 100 characters');
    } else {
      location = query.location.trim();
    }
  }

  // 3. Remote eligibility enum
  let remote_eligibility = undefined;
  if (query.remote_eligibility) {
    if (!RemoteEligibility[query.remote_eligibility]) {
      errors.push(
        `Invalid remote_eligibility "${query.remote_eligibility}". Allowed: ${Object.keys(RemoteEligibility).join(', ')}`
      );
    } else {
      remote_eligibility = query.remote_eligibility;
    }
  }

  // 4. Job type enum
  let job_type = undefined;
  if (query.job_type) {
    if (!JobType[query.job_type]) {
      errors.push(`Invalid job_type "${query.job_type}". Allowed: ${Object.keys(JobType).join(', ')}`);
    } else {
      job_type = query.job_type;
    }
  }

  // 5. Seniority enum
  let seniority = undefined;
  if (query.seniority) {
    if (!Seniority[query.seniority]) {
      errors.push(`Invalid seniority "${query.seniority}". Allowed: ${Object.keys(Seniority).join(', ')}`);
    } else {
      seniority = query.seniority;
    }
  }

  // 6. Currency enum
  let currency = undefined;
  if (query.currency) {
    if (!Currency[query.currency]) {
      errors.push(`Invalid currency "${query.currency}". Allowed: ${Object.keys(Currency).join(', ')}`);
    } else {
      currency = query.currency;
    }
  }

  // 7. Minimum salary
  let min_salary = undefined;
  if (query.min_salary !== undefined && query.min_salary !== null && query.min_salary !== '') {
    const parsedMin = Number(query.min_salary);
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      errors.push('Parameter "min_salary" must be a non-negative finite number');
    } else {
      min_salary = parsedMin;
    }
  }

  // 8. Sort option
  let sort = SortOption.DATE_DESC;
  if (query.sort) {
    if (!Object.values(SortOption).includes(query.sort)) {
      errors.push(`Invalid sort option "${query.sort}". Allowed: ${Object.values(SortOption).join(', ')}`);
    } else {
      sort = query.sort;
    }
  }

  // 9. Limit
  let limit = 20;
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    const parsedLimit = parseInt(query.limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push('Parameter "limit" must be an integer between 1 and 100');
    } else {
      limit = parsedLimit;
    }
  }

  // 10. Cursor
  let cursor = null;
  let decodedCursor = null;
  if (query.cursor) {
    try {
      decodedCursor = decodeCursor(query.cursor);
      cursor = query.cursor;
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: createProblemDetails({
        type: 'https://errors.seekers.internal/bad-request',
        title: 'Bad Request - Validation Error',
        status: 400,
        detail: errors.join('; '),
        instance: reqUrl,
      }),
    };
  }

  return {
    valid: true,
    params: {
      q,
      location,
      remote_eligibility,
      job_type,
      seniority,
      currency,
      min_salary,
      sort,
      limit,
      cursor,
      decodedCursor,
    },
  };
}

module.exports = {
  createProblemDetails,
  encodeCursor,
  decodeCursor,
  validateSearchParams,
};
