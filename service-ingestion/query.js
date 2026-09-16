// service-ingestion/query.js

/**
 * Builds MongoDB filter query from request parameters.
 * Supports keyword search (q) across title and company, and location filter.
 */
function buildJobQuery({ q, location } = {}) {
  const query = {};
  if (q) {
    query.$or = [{ title: new RegExp(q, 'i') }, { company: new RegExp(q, 'i') }];
  }
  if (location) {
    query.location = new RegExp(location, 'i');
  }
  return query;
}

module.exports = { buildJobQuery };
