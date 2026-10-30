/**
 * Phase 10 Explainable Matching Quality & Evaluation Benchmark Suite
 *
 * Evaluates:
 * 1. Ranking precision@k (P@1 and P@3) on representative candidate profiles.
 * 2. Hard exclusion violation rate (strictly 0.0% across all returned recommendations).
 * 3. Pay-period compensation normalization (yearly vs monthly, currency matching).
 * 4. Strict remote and geographic boundaries (FULLY_REMOTE rejects ON_SITE and HYBRID).
 * 5. Grounded, truthful explanations (no invented seniority preferences, no hallucinated skills).
 * 6. Skill alias deduplication (no artificial score inflation).
 * 7. Dismissed job feedback enforcement.
 * 8. Deterministic ranking reproducibility and bounded latency (< 20ms).
 */

import {
  filterAndRankRecommendations,
  scoreJob,
  CandidateMatchingProfile,
  RECOMMENDATION_ALGORITHM_VERSION,
} from './recommendation-engine';
import { CatalogJobResponse } from './dto/workspace.dto';

describe('P10 Recommendation Quality & Evaluation Benchmark', () => {
  // ─── EXPANDED 22-JOB CATALOG CORPUS ─────────────────────────────────────────

  const EVAL_CATALOG_JOBS: CatalogJobResponse[] = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Senior Distributed Systems Engineer (Go)',
      company: 'Pathao Tech',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 250000, max: 300000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Go', 'Kubernetes', 'PostgreSQL', 'Distributed Systems'],
      source: 'bdjobs',
      published_at: '2026-10-28T09:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      title: 'Lead Fullstack TypeScript Architect',
      company: 'Brain Station 23',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'LEAD',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 280000, max: 350000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['TypeScript', 'React', 'Node.js', 'GraphQL'],
      source: 'linkedin',
      published_at: '2026-10-27T10:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      title: 'Frontend React Developer',
      company: 'Chaldal Engineering',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'MID',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 120000, max: 160000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
      source: 'bdjobs',
      published_at: '2026-10-26T14:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      title: 'Data Platform Engineer',
      company: 'bKash Data Systems',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 160000, max: 220000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Python', 'PostgreSQL', 'Kafka', 'Airflow'],
      source: 'company_direct',
      published_at: '2026-10-25T11:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000005',
      title: 'Junior Go Backend Developer',
      company: 'Ctg Port Logistics IT',
      location: 'Chittagong, Bangladesh',
      remote_eligibility: 'ON_SITE',
      seniority: 'JUNIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 70000, max: 90000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Go', 'Docker', 'PostgreSQL'],
      source: 'bdjobs',
      published_at: '2026-10-24T08:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000006',
      title: 'DevOps & Site Reliability Engineer',
      company: 'Grameenphone IT',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'ON_SITE',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 200000, max: 250000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Kubernetes', 'Terraform', 'AWS', 'Docker'],
      source: 'linkedin',
      published_at: '2026-10-23T12:00:00.000Z',
    },
    {
      // Pay-period normalization trap: 600,000 BDT yearly = 50,000 BDT/mo
      id: '00000000-0000-0000-0000-000000000007',
      title: 'Junior Frontend Developer (Annual Compensation)',
      company: 'Dhaka Media Ltd',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'JUNIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 480000, max: 600000, currency: 'BDT', period: 'YEARLY' },
      skills: ['React', 'JavaScript', 'HTML5'],
      source: 'bdjobs',
      published_at: '2026-10-22T09:00:00.000Z',
    },
    {
      // Differing currency listing (USD)
      id: '00000000-0000-0000-0000-000000000008',
      title: 'US Remote Senior Go Architect',
      company: 'Global Cloud Systems',
      location: 'Remote',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 4000, max: 6000, currency: 'USD', period: 'MONTHLY' },
      skills: ['Go', 'Distributed Systems', 'Kubernetes', 'AWS'],
      source: 'remoteok',
      published_at: '2026-10-21T15:00:00.000Z',
    },
    {
      // USD Annual Compensation
      id: '00000000-0000-0000-0000-000000000009',
      title: 'Global Python Automation Engineer',
      company: 'Apex Data Labs',
      location: 'Remote',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'MID',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 36000, max: 48000, currency: 'USD', period: 'YEARLY' },
      skills: ['Python', 'Kafka', 'PostgreSQL'],
      source: 'weworkremotely',
      published_at: '2026-10-20T10:00:00.000Z',
    },
    {
      // Sylhet location
      id: '00000000-0000-0000-0000-000000000010',
      title: 'Java Backend Engineer in Sylhet',
      company: 'Sylhet Software Tech',
      location: 'Sylhet, Bangladesh',
      remote_eligibility: 'ON_SITE',
      seniority: 'MID',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 90000, max: 120000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Java', 'Spring Boot', 'PostgreSQL'],
      source: 'bdjobs',
      published_at: '2026-10-19T08:00:00.000Z',
    },
    {
      // FLAGGED listing - MUST be excluded
      id: '00000000-0000-0000-0000-000000000011',
      title: 'Suspicious High Paying Go Role',
      company: 'Ghost Operations',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'FLAGGED',
      salary: { min: 900000, max: 1000000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Go', 'Kubernetes'],
      source: 'unknown',
      published_at: '2026-10-18T10:00:00.000Z',
    },
    {
      // EXPIRED listing - MUST be excluded
      id: '00000000-0000-0000-0000-000000000012',
      title: 'Old Expired React Developer',
      company: 'Legacy Corp',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'MID',
      job_type: 'FULL_TIME',
      status: 'EXPIRED',
      salary: { min: 140000, max: 180000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['React', 'TypeScript'],
      source: 'bdjobs',
      published_at: '2026-08-01T10:00:00.000Z',
    },
    {
      // DRAFT listing - MUST be excluded
      id: '00000000-0000-0000-0000-000000000013',
      title: 'Unpublished Draft Python Role',
      company: 'Draft Tech',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'DRAFT',
      salary: { min: 200000, max: 250000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Python'],
      source: 'internal',
      published_at: '2026-10-17T10:00:00.000Z',
    },
    {
      // Unpopulated skills listing
      id: '00000000-0000-0000-0000-000000000014',
      title: 'React Frontend Specialist',
      company: 'Dhaka Startup Lab',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'MID',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 130000, max: 170000, currency: 'BDT', period: 'MONTHLY' },
      skills: [],
      source: 'bdjobs',
      published_at: '2026-10-16T12:00:00.000Z',
    },
    {
      // Relevant older job (published 60 days ago)
      id: '00000000-0000-0000-0000-000000000015',
      title: 'Staff Distributed Systems Architect',
      company: 'Enterprise Core Ltd',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'LEAD',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 320000, max: 400000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Go', 'Kubernetes', 'PostgreSQL', 'Distributed Systems'],
      source: 'linkedin',
      published_at: '2026-08-20T08:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000016',
      title: 'Mobile Flutter Developer',
      company: 'AppWorks Bangladesh',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'ON_SITE',
      seniority: 'MID',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 110000, max: 140000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Flutter', 'Dart', 'Firebase'],
      source: 'bdjobs',
      published_at: '2026-10-15T11:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000017',
      title: 'QA Test Automation Engineer',
      company: 'Kona Software Lab',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'MID',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 100000, max: 135000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Cypress', 'Playwright', 'TypeScript'],
      source: 'bdjobs',
      published_at: '2026-10-14T09:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000018',
      title: 'Machine Learning Research Engineer',
      company: 'Invento Robotics',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 220000, max: 280000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Python', 'PyTorch', 'Docker'],
      source: 'linkedin',
      published_at: '2026-10-13T10:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000019',
      title: 'Chittagong Web Designer',
      company: 'Bay IT Solutions',
      location: 'Chittagong, Bangladesh',
      remote_eligibility: 'ON_SITE',
      seniority: 'JUNIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 50000, max: 70000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['HTML5', 'CSS', 'JavaScript'],
      source: 'bdjobs',
      published_at: '2026-10-12T14:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000020',
      title: 'Entry Python Assistant',
      company: 'Bengal Soft Tech',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'ON_SITE',
      seniority: 'ENTRY',
      job_type: 'INTERNSHIP',
      status: 'ACTIVE',
      salary: { min: 35000, max: 45000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Python'],
      source: 'bdjobs',
      published_at: '2026-10-11T16:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000021',
      title: 'Senior Node.js Backend Engineer',
      company: 'Selise Digital Platforms',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'SENIOR',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 220000, max: 270000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Node.js', 'TypeScript', 'PostgreSQL'],
      source: 'linkedin',
      published_at: '2026-10-10T10:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000022',
      title: 'Staff Platform Systems Engineer',
      company: 'Dhaka Cloud Hub',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'HYBRID',
      seniority: 'LEAD',
      job_type: 'FULL_TIME',
      status: 'ACTIVE',
      salary: { min: 300000, max: 380000, currency: 'BDT', period: 'MONTHLY' },
      skills: ['Go', 'Docker', 'Kubernetes'],
      source: 'company_direct',
      published_at: '2026-10-09T09:00:00.000Z',
    },
  ];

  // ─── 11 REPRESENTATIVE BENCHMARK CANDIDATES ──────────────────────────────────

  interface BenchmarkCase {
    name: string;
    candidate: CandidateMatchingProfile;
    dismissedIds?: Set<string>;
    expectedTopJobId?: string;
    forbiddenJobIds?: string[];
    isColdStart?: boolean;
    assertSeniorityNotInvented?: boolean;
    assertDeduplicationEquivalence?: string[];
  }

  const benchmarkDataset: BenchmarkCase[] = [
    {
      name: '1. Senior Distributed Systems Engineer (Go/K8s/Postgres)',
      candidate: {
        userId: 'eval-cand-01',
        skills: ['Go', 'Kubernetes', 'PostgreSQL', 'Distributed Systems'],
        title: 'Senior Distributed Systems Engineer',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'HYBRID',
        minSalary: 240000,
        currency: 'BDT',
      },
      expectedTopJobId: '00000000-0000-0000-0000-000000000001',
      forbiddenJobIds: [
        '00000000-0000-0000-0000-000000000005', // Chittagong on-site
        '00000000-0000-0000-0000-000000000007', // 50k BDT/mo (< 240k min)
        '00000000-0000-0000-0000-000000000011', // FLAGGED
        '00000000-0000-0000-0000-000000000012', // EXPIRED
        '00000000-0000-0000-0000-000000000013', // DRAFT
      ],
    },
    {
      name: '2. Lead TypeScript & Frontend Architect (Fully Remote)',
      candidate: {
        userId: 'eval-cand-02',
        skills: ['TypeScript', 'React', 'Node.js', 'GraphQL'],
        title: 'Lead Fullstack TypeScript Architect',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'FULLY_REMOTE',
        minSalary: 280000,
        currency: 'BDT',
      },
      expectedTopJobId: '00000000-0000-0000-0000-000000000002',
      forbiddenJobIds: [
        '00000000-0000-0000-0000-000000000001', // HYBRID (rejected by FULLY_REMOTE)
        '00000000-0000-0000-0000-000000000003', // HYBRID
        '00000000-0000-0000-0000-000000000006', // ON_SITE
      ],
    },
    {
      name: '3. Frontend React Developer (Mid Level)',
      candidate: {
        userId: 'eval-cand-03',
        skills: ['React', 'JavaScript', 'TypeScript', 'Next.js'],
        title: 'Frontend React Developer',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'HYBRID',
        minSalary: 120000,
        currency: 'BDT',
      },
      expectedTopJobId: '00000000-0000-0000-0000-000000000003',
      forbiddenJobIds: [
        '00000000-0000-0000-0000-000000000007', // 600k BDT/yr = 50k/mo (< 120k min)
      ],
    },
    {
      name: '4. Python Data Platform Engineer (Fully Remote)',
      candidate: {
        userId: 'eval-cand-04',
        skills: ['Python', 'PostgreSQL', 'Kafka', 'Airflow'],
        title: 'Data Platform Engineer',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'FULLY_REMOTE',
        minSalary: 150000,
        currency: 'BDT',
      },
      expectedTopJobId: '00000000-0000-0000-0000-000000000004',
      forbiddenJobIds: [
        '00000000-0000-0000-0000-000000000018', // HYBRID ML role
        '00000000-0000-0000-0000-000000000020', // ON_SITE Python role
      ],
    },
    {
      name: '5. Junior Go Developer in Chittagong (Strict On-site)',
      candidate: {
        userId: 'eval-cand-05',
        skills: ['Go', 'Docker'],
        title: 'Junior Go Backend Engineer',
        locations: ['Chittagong, Bangladesh'],
        remotePreference: 'ON_SITE',
        minSalary: 70000,
        currency: 'BDT',
      },
      expectedTopJobId: '00000000-0000-0000-0000-000000000005',
      forbiddenJobIds: [
        '00000000-0000-0000-0000-000000000001', // Dhaka HYBRID
        '00000000-0000-0000-0000-000000000006', // Dhaka ON_SITE
        '00000000-0000-0000-0000-000000000010', // Sylhet ON_SITE
      ],
    },
    {
      name: '6. Cold-Start Candidate (Zero Skills & No Title)',
      candidate: {
        userId: 'eval-cand-06',
        skills: [],
        locations: [],
        remotePreference: 'UNSPECIFIED',
        currency: 'BDT',
      },
      isColdStart: true,
      assertSeniorityNotInvented: true,
    },
    {
      name: '7. Strict Salary Boundary: 100,000 BDT/mo Minimum vs 600,000 BDT/yr Listing',
      candidate: {
        userId: 'eval-cand-07',
        skills: ['React', 'JavaScript'],
        title: 'React Developer',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'HYBRID',
        minSalary: 100000,
        currency: 'BDT',
      },
      // Job 7 is 600k BDT/yr = 50k BDT/mo. Must be strictly excluded!
      forbiddenJobIds: ['00000000-0000-0000-0000-000000000007'],
    },
    {
      name: '8. International USD Candidate (3,500 USD/mo Requirement)',
      candidate: {
        userId: 'eval-cand-08',
        skills: ['Go', 'Distributed Systems', 'Kubernetes'],
        title: 'Senior Cloud Architect',
        locations: [],
        remotePreference: 'FULLY_REMOTE',
        minSalary: 3500,
        currency: 'USD',
      },
      expectedTopJobId: '00000000-0000-0000-0000-000000000008', // USD 4k-6k/mo
      forbiddenJobIds: [
        '00000000-0000-0000-0000-000000000001', // HYBRID
        '00000000-0000-0000-0000-000000000006', // ON_SITE
      ],
    },
    {
      name: '9. Candidate in Sylhet (Strict On-site)',
      candidate: {
        userId: 'eval-cand-09',
        skills: ['Java', 'Spring Boot'],
        title: 'Java Backend Engineer',
        locations: ['Sylhet, Bangladesh'],
        remotePreference: 'ON_SITE',
        minSalary: 80000,
        currency: 'BDT',
      },
      expectedTopJobId: '00000000-0000-0000-0000-000000000010', // Sylhet ON_SITE
      forbiddenJobIds: [
        '00000000-0000-0000-0000-000000000001', // Dhaka HYBRID
        '00000000-0000-0000-0000-000000000005', // Chittagong ON_SITE
        '00000000-0000-0000-0000-000000000006', // Dhaka ON_SITE
      ],
    },
    {
      name: '10. Candidate With Dismissed Job Feedback',
      candidate: {
        userId: 'eval-cand-10',
        skills: ['Go', 'Kubernetes', 'PostgreSQL'],
        title: 'Senior Distributed Systems Engineer',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'HYBRID',
        currency: 'BDT',
      },
      dismissedIds: new Set(['00000000-0000-0000-0000-000000000001']), // Dismissed top job
      forbiddenJobIds: ['00000000-0000-0000-0000-000000000001'],
    },
    {
      name: '11. Candidate With Redundant Skill Aliases (React.js, ReactJS, React, TS, TypeScript)',
      candidate: {
        userId: 'eval-cand-11',
        skills: ['React.js', 'ReactJS', 'React', 'TypeScript', 'TS'],
        title: 'Frontend Engineer',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'HYBRID',
        currency: 'BDT',
      },
      assertDeduplicationEquivalence: ['React', 'TypeScript'],
    },
  ];

  // ─── EVALUATION ASSERTIONS ──────────────────────────────────────────────────

  it('maintains 0.0% hard exclusion violation rate across all 11 benchmark profiles', () => {
    let totalEvaluatedJobs = 0;
    let violationCount = 0;

    for (const testCase of benchmarkDataset) {
      const dismissed = testCase.dismissedIds || new Set();
      const { items } = filterAndRankRecommendations(
        testCase.candidate,
        EVAL_CATALOG_JOBS,
        dismissed,
      );

      for (const item of items) {
        totalEvaluatedJobs++;

        // 1. Inactive or expired status check (status !== ACTIVE or is_expired === true)
        if (item.is_expired) {
          violationCount++;
        }

        // 2. Strict remote preference check: candidate FULLY_REMOTE cannot receive ON_SITE or HYBRID
        if (
          testCase.candidate.remotePreference === 'FULLY_REMOTE' &&
          (item.remote_eligibility === 'ON_SITE' ||
            item.remote_eligibility === 'HYBRID')
        ) {
          violationCount++;
        }

        // 3. Strict ON_SITE location boundary check
        if (
          testCase.candidate.remotePreference === 'ON_SITE' &&
          testCase.candidate.locations &&
          testCase.candidate.locations.length > 0 &&
          item.remote_eligibility !== 'FULLY_REMOTE'
        ) {
          const jobLoc = (item.location || '').toLowerCase();
          const matches = testCase.candidate.locations.some((loc) =>
            jobLoc.includes(loc.toLowerCase()),
          );
          if (!matches) {
            violationCount++;
          }
        }

        // 4. Strict salary check: pay-period normalized monthly cap must satisfy minimum
        if (
          testCase.candidate.minSalary &&
          item.salary &&
          typeof item.salary === 'object' &&
          item.salary.currency === testCase.candidate.currency
        ) {
          let monthlyCap = item.salary.max ?? item.salary.min;
          if (monthlyCap && item.salary.period === 'YEARLY') {
            monthlyCap = Math.round(monthlyCap / 12);
          }
          if (monthlyCap && monthlyCap < testCase.candidate.minSalary) {
            violationCount++;
          }
        }

        // 5. Dismissed job feedback check: dismissed ID must never appear in any returned position
        if (dismissed.has(item.id)) {
          violationCount++;
        }

        // 6. Specific forbidden job IDs for this benchmark test case
        if (testCase.forbiddenJobIds?.includes(item.id)) {
          violationCount++;
        }
      }
    }

    expect(totalEvaluatedJobs).toBeGreaterThan(30);
    const violationRate = violationCount / totalEvaluatedJobs;
    expect(violationRate).toBe(0.0); // 0.0% Hard Exclusion Violation Rate
  });

  it('achieves 100% precision@1 on targeted benchmark profiles', () => {
    const targetedCases = benchmarkDataset.filter(
      (c) => c.expectedTopJobId !== undefined,
    );
    let correctTopRankCount = 0;

    for (const testCase of targetedCases) {
      const { items } = filterAndRankRecommendations(
        testCase.candidate,
        EVAL_CATALOG_JOBS,
        testCase.dismissedIds || new Set(),
        { limit: 5 },
      );

      expect(items.length).toBeGreaterThan(0);
      if (items[0].id === testCase.expectedTopJobId) {
        correctTopRankCount++;
      }
    }

    const precisionAt1 = correctTopRankCount / targetedCases.length;
    expect(precisionAt1).toBe(1.0); // 100% Precision@1
  });

  it('achieves >= 85% precision@3 across all non-cold-start profiles', () => {
    const relevantCases = benchmarkDataset.filter(
      (c) => !c.isColdStart && c.expectedTopJobId !== undefined,
    );
    let totalTop3Relevant = 0;

    for (const testCase of relevantCases) {
      const { items } = filterAndRankRecommendations(
        testCase.candidate,
        EVAL_CATALOG_JOBS,
        testCase.dismissedIds || new Set(),
        { limit: 3 },
      );

      const top3 = items.slice(0, 3);
      // Top 3 should not include any forbidden jobs
      const cleanItems = top3.filter(
        (it) => !testCase.forbiddenJobIds?.includes(it.id),
      );
      totalTop3Relevant += cleanItems.length / top3.length;
    }

    const avgPrecisionAt3 = totalTop3Relevant / relevantCases.length;
    expect(avgPrecisionAt3).toBeGreaterThanOrEqual(0.85);
  });

  it('guarantees 100% explanation grounding (zero hallucinated skills or fake seniority)', () => {
    for (const testCase of benchmarkDataset) {
      const { items } = filterAndRankRecommendations(
        testCase.candidate,
        EVAL_CATALOG_JOBS,
        testCase.dismissedIds || new Set(),
      );

      for (const item of items) {
        // Every reported matched_skill must be present in candidate skills or candidate title
        for (const matchedSkill of item.match_reasons.matched_skills) {
          const isGrounded =
            testCase.candidate.skills.some(
              (cs) =>
                cs.toLowerCase().includes(matchedSkill.toLowerCase()) ||
                matchedSkill.toLowerCase().includes(cs.toLowerCase()),
            ) ||
            (testCase.candidate.title &&
              testCase.candidate.title
                .toLowerCase()
                .includes(matchedSkill.toLowerCase()));

          expect(isGrounded).toBe(true);
        }

        // Truthful seniority: if candidate has no title, reason must NOT claim "Matches your ... preference"
        if (testCase.assertSeniorityNotInvented) {
          expect(item.match_reasons.seniority_reason).toContain(
            'seniority preference not specified on your profile',
          );
          expect(item.match_reasons.seniority_reason).not.toContain(
            'Matches your',
          );
        }

        // Overall summary and algorithm version must be non-empty and valid
        expect(item.match_reasons.overall_summary).toBeDefined();
        expect(item.algorithm_version).toBe(RECOMMENDATION_ALGORITHM_VERSION);
      }
    }
  });

  it('deduplicates skill aliases and produces identical score to deduplicated profile', () => {
    const aliasCase = benchmarkDataset.find(
      (c) => c.assertDeduplicationEquivalence !== undefined,
    )!;
    const cleanCandidate: CandidateMatchingProfile = {
      ...aliasCase.candidate,
      skills: aliasCase.assertDeduplicationEquivalence!,
    };

    const targetJob = EVAL_CATALOG_JOBS.find(
      (j) => j.id === '00000000-0000-0000-0000-000000000003',
    )!;

    const scoreWithAliases = scoreJob(aliasCase.candidate, targetJob);
    const scoreClean = scoreJob(cleanCandidate, targetJob);

    // Aliases like 'React.js', 'ReactJS', 'React' must not inflate score above clean profile
    expect(scoreWithAliases.score).toBe(scoreClean.score);
  });

  it('correctly ranks relevant older jobs outside newest 5 by relevance score', () => {
    // Candidate 1 (Senior Go) should find Job 15 (older staff Go role) ranked highly despite being 60 days old
    const candidate1 = benchmarkDataset[0].candidate;
    const { items } = filterAndRankRecommendations(
      candidate1,
      EVAL_CATALOG_JOBS,
      new Set(),
    );

    const job15Index = items.findIndex(
      (it) => it.id === '00000000-0000-0000-0000-000000000015',
    );
    expect(job15Index).toBeGreaterThanOrEqual(0);
    // Should be in top 5 because it has 4 matching skills
    expect(job15Index).toBeLessThan(5);
  });

  it('executes candidate ranking deterministically within bounded latency (< 20ms)', () => {
    const candidate = benchmarkDataset[0].candidate;
    const runs = 50;
    const latencies: number[] = [];

    let baselineResultIds = '';

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      const { items } = filterAndRankRecommendations(
        candidate,
        EVAL_CATALOG_JOBS,
        new Set(),
      );
      const elapsed = performance.now() - start;
      latencies.push(elapsed);

      const runIds = items.map((it) => it.id).join(',');
      if (i === 0) {
        baselineResultIds = runIds;
      } else {
        // 100% deterministic reproducibility across repeated runs
        expect(runIds).toBe(baselineResultIds);
      }
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    expect(avgLatency).toBeLessThan(20.0); // Bounded well under 20ms across 50 runs on 22 jobs
  });
});
