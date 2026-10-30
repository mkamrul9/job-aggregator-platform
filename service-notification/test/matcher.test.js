'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { evaluateJobMatch, toMonthlySalary } = require('../src/matcher');

describe('service-notification: matcher tests', () => {
  const baseJob = {
    id: 'job-001',
    title: 'Senior Backend Engineer (Go / Distributed Systems)',
    company: 'Pathao Engineering',
    location: 'Dhaka, Bangladesh',
    remote_eligibility: 'HYBRID',
    status: 'ACTIVE',
    is_expired: false,
    skills: ['Go', 'Kafka', 'PostgreSQL'],
    salary: {
      min: 180000,
      max: 250000,
      currency: 'BDT',
      period: 'MONTHLY',
    },
  };

  const baseSub = {
    id: 'sub-001',
    candidate_id: 'usr-001',
    email: 'kamrul@example.com',
    query: 'Go Backend',
    location: 'Dhaka',
    remote_preference: 'ANY',
    active: true,
    email_verified: true,
  };

  it('matches eligible job with matching query and location', () => {
    const result = evaluateJobMatch(baseJob, baseSub);
    assert.strictEqual(result.matches, true);
    assert.strictEqual(result.reason, 'MATCH_CRITERIA_SATISFIED');
  });

  it('rejects word-boundary false positives (reactor vs react)', () => {
    const reactSub = { ...baseSub, query: 'React' };
    const reactorJob = {
      ...baseJob,
      title: 'Nuclear Reactor Operator',
      skills: ['Physics'],
      description: 'Operations manager for reactor vessel.',
    };

    const result = evaluateJobMatch(reactorJob, reactSub);
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.reason, 'QUERY_NO_MATCH');
  });

  it('strictly enforces FULLY_REMOTE preference against HYBRID or ON_SITE jobs', () => {
    const remoteOnlySub = { ...baseSub, remote_preference: 'FULLY_REMOTE' };
    const hybridJob = { ...baseJob, remote_eligibility: 'HYBRID' };
    const onSiteJob = { ...baseJob, remote_eligibility: 'ON_SITE' };

    const hybridResult = evaluateJobMatch(hybridJob, remoteOnlySub);
    assert.strictEqual(hybridResult.matches, false);
    assert.strictEqual(hybridResult.reason, 'REMOTE_PREFERENCE_MISMATCH');

    const onSiteResult = evaluateJobMatch(onSiteJob, remoteOnlySub);
    assert.strictEqual(onSiteResult.matches, false);
    assert.strictEqual(onSiteResult.reason, 'REMOTE_PREFERENCE_MISMATCH');

    const fullyRemoteJob = { ...baseJob, remote_eligibility: 'FULLY_REMOTE' };
    const fullyRemoteResult = evaluateJobMatch(fullyRemoteJob, remoteOnlySub);
    assert.strictEqual(fullyRemoteResult.matches, true);
  });

  it('enforces location matching for on-site/hybrid roles', () => {
    const londonSub = { ...baseSub, location: 'London' };
    const dhakaJob = { ...baseJob, location: 'Dhaka, Bangladesh', remote_eligibility: 'HYBRID' };

    const result = evaluateJobMatch(dhakaJob, londonSub);
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.reason, 'LOCATION_MISMATCH');
  });

  it('allows candidate in any location to match a FULLY_REMOTE role', () => {
    const londonSub = { ...baseSub, location: 'London' };
    const remoteJob = { ...baseJob, location: 'Worldwide', remote_eligibility: 'FULLY_REMOTE' };

    const result = evaluateJobMatch(remoteJob, londonSub);
    assert.strictEqual(result.matches, true);
  });

  it('normalizes compensation periods (hourly, monthly, annual)', () => {
    assert.strictEqual(toMonthlySalary(50, 'HOURLY'), 8000); // 50 * 160
    assert.strictEqual(toMonthlySalary(120000, 'YEARLY'), 10000); // 120000 / 12
    assert.strictEqual(toMonthlySalary(20000, 'MONTHLY'), 20000);

    const highSalarySub = {
      ...baseSub,
      min_salary: 300000,
      currency: 'BDT',
      pay_period: 'MONTHLY',
    };

    const result = evaluateJobMatch(baseJob, highSalarySub);
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.reason, 'SALARY_BELOW_MINIMUM');
  });

  it('rejects currency mismatch when currencies are defined and differ', () => {
    const usdSub = {
      ...baseSub,
      min_salary: 1000,
      currency: 'USD',
      pay_period: 'MONTHLY',
    };

    const result = evaluateJobMatch(baseJob, usdSub);
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.reason, 'SALARY_CURRENCY_MISMATCH');
  });

  it('resolves skill aliases (e.g. golang <-> go, ts <-> typescript, k8s <-> kubernetes)', () => {
    const subGolang = { ...baseSub, query: 'golang' };
    const jobGo = {
      ...baseJob,
      title: 'Backend Specialist',
      skills: ['Go', 'Docker'],
      description: 'Building microservices.',
    };
    const resGo = evaluateJobMatch(jobGo, subGolang);
    assert.strictEqual(resGo.matches, true);

    const subTs = { ...baseSub, query: 'TypeScript' };
    const jobTs = {
      ...baseJob,
      title: 'Frontend Engineer',
      skills: ['ts', 'react'],
      description: 'Web UI dev.',
    };
    const resTs = evaluateJobMatch(jobTs, subTs);
    assert.strictEqual(resTs.matches, true);
  });

  it('matches punctuation-heavy technologies safely (C++, .NET, Node.js, C#)', () => {
    const subCpp = { ...baseSub, query: 'C++' };
    const jobCpp = {
      ...baseJob,
      title: 'Systems Developer',
      skills: ['C++', 'Linux'],
      description: 'Low-latency trading engine in C++.',
    };
    assert.strictEqual(evaluateJobMatch(jobCpp, subCpp).matches, true);

    const subDotNet = { ...baseSub, query: '.NET' };
    const jobDotNet = {
      ...baseJob,
      title: 'Backend Developer',
      skills: ['.NET', 'C#', 'SQL Server'],
      description: 'Enterprise APIs with .NET Core.',
    };
    assert.strictEqual(evaluateJobMatch(jobDotNet, subDotNet).matches, true);
  });

  it('rejects inactive, expired, or non-active jobs', () => {
    const expiredJob1 = { ...baseJob, status: 'EXPIRED' };
    assert.strictEqual(evaluateJobMatch(expiredJob1, baseSub).matches, false);
    assert.strictEqual(evaluateJobMatch(expiredJob1, baseSub).reason, 'JOB_NOT_ACTIVE');

    const expiredJob2 = { ...baseJob, is_expired: true };
    assert.strictEqual(evaluateJobMatch(expiredJob2, baseSub).matches, false);
    assert.strictEqual(evaluateJobMatch(expiredJob2, baseSub).reason, 'JOB_EXPIRED');

    const expiredJob3 = { ...baseJob, expires_at: new Date(Date.now() - 3600000).toISOString() };
    assert.strictEqual(evaluateJobMatch(expiredJob3, baseSub).matches, false);
    assert.strictEqual(evaluateJobMatch(expiredJob3, baseSub).reason, 'JOB_EXPIRED');
  });

  it('strictly rejects missing or false email_verified', () => {
    const missingVerified = { ...baseSub, email_verified: undefined, emailVerified: undefined };
    assert.strictEqual(evaluateJobMatch(baseJob, missingVerified).matches, false);
    assert.strictEqual(evaluateJobMatch(baseJob, missingVerified).reason, 'EMAIL_NOT_VERIFIED');

    const falseVerified = { ...baseSub, email_verified: false };
    assert.strictEqual(evaluateJobMatch(baseJob, falseVerified).matches, false);
    assert.strictEqual(evaluateJobMatch(baseJob, falseVerified).reason, 'EMAIL_NOT_VERIFIED');
  });

  it('rejects paused subscriptions, unverified emails, suppressed users, and dismissed jobs', () => {
    const pausedSub = { ...baseSub, active: false };
    assert.strictEqual(evaluateJobMatch(baseJob, pausedSub).reason, 'SUBSCRIPTION_PAUSED');

    const unverifiedSub = { ...baseSub, email_verified: false };
    assert.strictEqual(evaluateJobMatch(baseJob, unverifiedSub).reason, 'EMAIL_NOT_VERIFIED');

    const suppressedCheck = evaluateJobMatch(baseJob, baseSub, {
      isSuppressed: (email) => email === 'kamrul@example.com',
    });
    assert.strictEqual(suppressedCheck.reason, 'RECIPIENT_SUPPRESSED');

    const dismissedCheck = evaluateJobMatch(baseJob, baseSub, {
      dismissals: new Set(['job-001']),
    });
    assert.strictEqual(dismissedCheck.reason, 'JOB_DISMISSED');
  });
});
