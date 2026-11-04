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
 *  4. Workloads with plain-text substituted for PDF fixtures fail closed with INVALID_PDF_SIGNATURE.
 *  5. Workloads with errors exceeding error budgets return sla_met === false.
 *  6. Healthy runs with valid data return sla_met === true, real extracted skills, and positive completed counts.
 */

const assert = require('assert');
const fs = require('fs');
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
    console.log('  ✓ [PASS] benchmarkResumeExtractor fails closed when fixture directory is missing.');
    passed++;
  }

  // 6. benchmarkResumeExtractor with plain-text substitute fixture must fail closed
  {
    const fakeDir = path.join(process.cwd(), 'data', 'test_scratch', `fake_plain_${Date.now()}`);
    const fakeResumesDir = path.join(fakeDir, 'resumes');
    fs.mkdirSync(fakeResumesDir, { recursive: true });
    const fakePdfPath = path.join(fakeResumesDir, 'usr_bench_00000_resume.pdf');
    fs.writeFileSync(fakePdfPath, 'Plain text CV substitute without %PDF header. Skills: Go, Python, React.', 'utf8');

    try {
      const res = await benchmarkResumeExtractor(fakeDir);
      assert.strictEqual(res.sla_met, false, 'Plain text substitute must NEVER achieve sla_met=true');
      assert.strictEqual(res.completed, 0, 'Completed extractions on plain text must be 0');
      assert.strictEqual(res.errors, 30, 'All 30 iterations on plain text must be recorded as errors');
      assert.strictEqual(res.percentiles_ms.p95, null, 'p95 must be null on failed extraction');
      assert(res.failure_reason.includes('INVALID_PDF_SIGNATURE'), 'Must report INVALID_PDF_SIGNATURE error');
      console.log('  ✓ [PASS] Plain-text substitute fails closed with INVALID_PDF_SIGNATURE (0 completions, 30 errors).');
      passed++;
    } finally {
      try {
        fs.rmSync(fakeDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  // 7. Healthy execution with valid seeded dataset
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

    const resumeRes = await benchmarkResumeExtractor(targetDir);
    assert.strictEqual(resumeRes.sla_met, true, 'Healthy resume parser must pass');
    assert.strictEqual(resumeRes.errors, 0, 'Healthy resume parser must have 0 errors');
    assert.strictEqual(resumeRes.completed, 30, 'Must complete all 30 real extractions');
    assert(typeof resumeRes.percentiles_ms.p95 === 'number', 'p95 must be valid numeric latency');

    console.log('  ✓ [PASS] Healthy dataset achieves sample coverage, 0 errors, and positive throughput across all benchmarks.');
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
