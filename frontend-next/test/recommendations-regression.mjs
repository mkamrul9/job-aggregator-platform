/**
 * Phase 10 Recommendations & Deterministic Matching Regressions (Frontend)
 */

import assert from 'node:assert';
import {
  matchesSkill,
  checkHardExclusions,
  scoreJob,
  computeDemoRecommendations,
  RECOMMENDATION_ALGORITHM_VERSION,
} from '../lib/recommendation-adapter.ts';
import { SYNTHETIC_JOBS } from '../lib/mock-data.ts';

console.log('====================================================');
console.log('  Next.js Explainable Recommendations Regressions  ');
console.log('====================================================\n');

// Test 1: matchesSkill prevents false-positive substring matches
console.log('Test 1: Verifying skill matching and alias handling...');
assert.strictEqual(matchesSkill('Go', 'golang'), true, 'Go matches golang alias');
assert.strictEqual(matchesSkill('golang', 'go'), true, 'golang matches Go alias');
assert.strictEqual(matchesSkill('go', 'django'), false, 'go does not match substring in django');
assert.strictEqual(matchesSkill('go', 'algorithm'), false, 'go does not match substring in algorithm');
assert.strictEqual(matchesSkill('React', 'react.js'), true, 'React matches react.js alias');
assert.strictEqual(matchesSkill('ts', 'typescript'), true, 'ts matches typescript');
console.log('✔ [PASS] Skill matching and alias isolation verified without substring errors');

// Test 2: Hard constraint enforcement
console.log('\nTest 2: Verifying hard constraint enforcement...');
const candidate = {
  skills: ['TypeScript', 'React'],
  title: 'Senior Frontend Engineer',
  locations: ['Dhaka, Bangladesh'],
  remotePreference: 'FULLY_REMOTE',
  minSalary: 150000,
  currency: 'BDT',
};

const sampleJob = SYNTHETIC_JOBS[0]; // e.g. Pathao Senior Go Engineer (On-site / Hybrid, 250,000 BDT)

// Dismissed exclusion
const dismissedCheck = checkHardExclusions(candidate, sampleJob, new Set([sampleJob.id]));
assert.strictEqual(dismissedCheck.eligible, false, 'Dismissed job is strictly excluded');
assert.strictEqual(dismissedCheck.exclusionReason, 'DISMISSED_BY_CANDIDATE');

// Remote violation: candidate requires FULLY_REMOTE, job is ON_SITE
const onSiteJob = { ...sampleJob, remote_eligibility: 'ON_SITE' };
const remoteCheck = checkHardExclusions(candidate, onSiteJob, new Set());
assert.strictEqual(remoteCheck.eligible, false, 'On-site job strictly excluded for fully remote candidate');
assert.strictEqual(remoteCheck.exclusionReason, 'REMOTE_PREFERENCE_MISMATCH');

// Salary violation: job salary below candidate minSalary
const lowSalaryJob = {
  ...sampleJob,
  remote_eligibility: 'FULLY_REMOTE',
  salary: { min: 100000, max: 120000, currency: 'BDT', period: 'MONTHLY' },
};
const salaryCheck = checkHardExclusions(candidate, lowSalaryJob, new Set());
assert.strictEqual(salaryCheck.eligible, false, 'Salary below minimum strictly excluded');
assert.strictEqual(salaryCheck.exclusionReason, 'SALARY_BELOW_MINIMUM');
console.log('✔ [PASS] Hard exclusions (dismissed, remote, salary) verified');

// Test 3: Deterministic scoring and explainable reasons
console.log('\nTest 3: Testing deterministic scoring and explainability...');
const { score, matchReasons } = scoreJob(candidate, sampleJob);
assert.strictEqual(typeof score, 'number');
assert(score >= 0 && score <= 100, 'Score is bounded between 0 and 100');
assert.strictEqual(Array.isArray(matchReasons.matched_skills), true);
assert.strictEqual(Array.isArray(matchReasons.missing_skills), true);
assert.strictEqual(typeof matchReasons.overall_summary, 'string');
console.log('✔ [PASS] Deterministic score and structured explanation verified');

// Test 4: Demo recommendation computation & deterministic reproducibility
console.log('\nTest 4: Testing computeDemoRecommendations ranking & reproducibility...');
const res1 = computeDemoRecommendations(candidate, SYNTHETIC_JOBS, new Set());
const res2 = computeDemoRecommendations(candidate, SYNTHETIC_JOBS, new Set());

assert.strictEqual(res1.items.length, res2.items.length);
assert.strictEqual(res1.items[0]?.id, res2.items[0]?.id, 'Deterministic top recommendation is identical');
assert.strictEqual(res1.items[0]?.algorithm_version, RECOMMENDATION_ALGORITHM_VERSION);

// Dismissal removes job from results
const topId = res1.items[0]?.id;
if (topId) {
  const dismissedSet = new Set([topId]);
  const resDismissed = computeDemoRecommendations(candidate, SYNTHETIC_JOBS, dismissedSet);
  assert.strictEqual(resDismissed.items.some(j => j.id === topId), false, 'Dismissed job is not returned in recommendations');
}
console.log('✔ [PASS] Demo recommendations ranking and dismissal verified');

console.log('\n----------------------------------------------------');
console.log('✔ All 4 frontend recommendation regressions passed!\n');

