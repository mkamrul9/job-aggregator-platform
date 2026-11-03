#!/usr/bin/env node
'use strict';

/**
 * scripts/test-benchmark-accounting.js
 * Regression verification suite for Benchmark Accounting & Fail-Closed Invariants (P15 Repair)
 *
 * Asserts that:
 *  1. calculatePercentiles([]) returns nulls, never 0 ms.
 *  2. Workloads with 100% failure (e.g. [null]) return sla_met === false, completed === 0, p95 === null.
 *  3. Workloads missing fixture files fail closed with sla_met === false.
 *  4. Workloads with errors exceeding error budgets return sla_met === false.
 *  5. Healthy runs with valid data return sla_met === true and positive completed counts.
 */

const assert = require('assert');
const path = require('path');
const {
  calculatePercentiles,
  benchmarkSearchWorkload,
  benchmarkWorkspaceWorkload,
  benchmarkResumeExtractor
} = require('./benchmark-workloads');
const { seedBenchmarkDataset } = require('./benchmark-seeder');

async function runBenchmarkAccountingTests() {
  console.log('========================================================================');
  console.log('[ACCOUNTING-TESTS] Running P15 Benchmark Accounting Regression Suite');
  console.log('========================================================================\n');

  let passed = 0;

  // 1. calculatePercentiles with empty array
  {
    const emptyStats = calculatePercentiles([]);
    assert.strictEqual(emptyStats.count, 0, 'Empty count must be 0');
    assert.strictEqual(emptyStats.p50, null, 'Empty p50 must be null, not 0');
    assert.strictEqual(emptyStats.p95, null, 'Empty p95 must be null, not 0');
    assert.strictEqual(emptyStats.p99, null, 'Empty p99 must be null, not 0');
    console.log('  ✓ [PASS] calculatePercentiles([]) returns null percentiles (prevents false 0ms PASS).');
    passed++;
  }

  // 2. calculatePercentiles with null/undefined/non-array
  {
    const nullStats = calculatePercentiles(null);
    assert.strictEqual(nullStats.p95, null);
    assert.strictEqual(nullStats.count, 0);

    const nanStats = calculatePercentiles([NaN, undefined, null]);
    assert.strictEqual(nanStats.p95, null);
    assert.strictEqual(nanStats.count, 0);
    console.log('  ✓ [PASS] calculatePercentiles handles malformed/NaN arrays fail-closed.');
    passed++;
  }

  // 3. benchmarkSearchWorkload([null]) must return sla_met === false
  {
    const res = await benchmarkSearchWorkload([null]);
    assert.strictEqual(res.sla_met, false, 'Search benchmark must FAIL when all items error');
    assert.strictEqual(res.completed, 0, 'Completed count must be 0');
    assert.strictEqual(res.errors, 200, 'All 200 iterations must be counted as errors');
    assert.strictEqual(res.throughput_rps, 0, 'Throughput of failed operations must be 0');
    assert.strictEqual(res.percentiles_ms.p95, null, 'p95 of failed operations must be null');
    console.log('  ✓ [PASS] benchmarkSearchWorkload([null]) strictly returns sla_met=false with 200 errors.');
    passed++;
  }

  // 4. benchmarkWorkspaceWorkload([null]) must return sla_met === false
  {
    const res = await benchmarkWorkspaceWorkload([null]);
    assert.strictEqual(res.sla_met, false, 'Workspace benchmark must FAIL when all items error');
    assert.strictEqual(res.completed, 0, 'Completed count must be 0');
    assert.strictEqual(res.errors, 150, 'All 150 iterations must be counted as errors');
    assert.strictEqual(res.throughput_rps, 0, 'Throughput of failed operations must be 0');
    assert.strictEqual(res.percentiles_ms.p95, null, 'p95 of failed operations must be null');
    console.log('  ✓ [PASS] benchmarkWorkspaceWorkload([null]) strictly returns sla_met=false with 150 errors.');
    passed++;
  }

  // 5. benchmarkResumeExtractor with missing fixture path must return sla_met === false
  {
    const res = await benchmarkResumeExtractor('/nonexistent/directory/for/testing');
    assert.strictEqual(res.sla_met, false, 'Resume extractor must FAIL when fixture directory is missing');
    assert.strictEqual(res.completed, 0);
    assert.strictEqual(res.errors, 30);
    assert.strictEqual(res.percentiles_ms.p95, null);
    console.log('  ✓ [PASS] benchmarkResumeExtractor fails closed without silent mock string fallback.');
    passed++;
  }

  // 6. Healthy execution with valid seeded dataset
  {
    const { listings, candidates, targetDir } = await seedBenchmarkDataset({
      listingCount: 20,
      candidateCount: 10
    });

    const searchRes = await benchmarkSearchWorkload(listings);
    assert.strictEqual(searchRes.sla_met, true, 'Healthy search must pass');
    assert(searchRes.completed >= searchRes.min_samples_required, 'Must achieve required sample coverage');
    assert.strictEqual(searchRes.errors, 0, 'Healthy run must have 0 errors');
    assert(typeof searchRes.percentiles_ms.p95 === 'number', 'p95 must be a valid number');
    assert(searchRes.throughput_rps > 0, 'Throughput must be positive');
    console.log('  ✓ [PASS] Healthy dataset achieves sample coverage, 0 errors, and positive throughput.');
    passed++;
  }

  console.log('\n========================================================================');
  console.log(`[ACCOUNTING-TESTS] ALL ${passed} BENCHMARK ACCOUNTING INVARIANTS CERTIFIED!`);
  console.log('========================================================================\n');
}

if (require.main === module) {
  runBenchmarkAccountingTests().catch(err => {
    console.error('[ACCOUNTING-TESTS] FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmarkAccountingTests };
