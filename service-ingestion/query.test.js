const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJobQuery } = require('./query');

test('buildJobQuery returns empty query when no params provided', () => {
  const query = buildJobQuery({});
  assert.deepEqual(query, {});
});

test('buildJobQuery filters by location with case-insensitive regex', () => {
  const query = buildJobQuery({ location: 'London' });
  assert.ok(query.location instanceof RegExp);
  assert.equal(query.location.source, 'London');
  assert.equal(query.location.flags, 'i');
  assert.equal(query.location.test('london'), true);
  assert.equal(query.location.test('LONDON'), true);
  assert.equal(query.location.test('New York'), false);
  assert.equal(query.$or, undefined);
});

test('buildJobQuery combines ?q and ?location filters correctly', () => {
  const query = buildJobQuery({ q: 'React', location: 'Remote' });
  assert.ok(Array.isArray(query.$or));
  assert.equal(query.$or.length, 2);
  assert.equal(query.$or[0].title.test('Senior React Developer'), true);
  assert.equal(query.$or[1].company.test('Reactify Inc'), true);

  assert.ok(query.location instanceof RegExp);
  assert.equal(query.location.test('remote'), true);
  assert.equal(query.location.test('Remote (US)'), true);
  assert.equal(query.location.test('Hybrid London'), false);
});
