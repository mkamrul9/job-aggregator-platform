import {
  matchesSkill,
  checkHardExclusions,
  scoreJob,
  filterAndRankRecommendations,
  STANDALONE_SEED_JOBS,
  RECOMMENDATION_ALGORITHM_VERSION,
  CandidateMatchingProfile,
} from './recommendation-engine';
import { CatalogJobResponse } from './dto/workspace.dto';

describe('RecommendationEngine (Deterministic v1.0.0)', () => {
  describe('matchesSkill & Token Aliases', () => {
    it('matches exact skills case-insensitively', () => {
      expect(matchesSkill('Python', 'python')).toBe(true);
      expect(matchesSkill('TypeScript', 'typescript')).toBe(true);
      expect(matchesSkill('Kubernetes', 'KUBERNETES')).toBe(true);
    });

    it('matches configured skill aliases bidirectionally', () => {
      expect(matchesSkill('Go', 'golang')).toBe(true);
      expect(matchesSkill('golang', 'Go')).toBe(true);
      expect(matchesSkill('React', 'react.js')).toBe(true);
      expect(matchesSkill('reactjs', 'React')).toBe(true);
      expect(matchesSkill('ts', 'TypeScript')).toBe(true);
      expect(matchesSkill('k8s', 'Kubernetes')).toBe(true);
      expect(matchesSkill('postgres', 'PostgreSQL')).toBe(true);
    });

    it('strictly prevents substring false positives (e.g., "go" does not match "django")', () => {
      expect(matchesSkill('go', 'django')).toBe(false);
      expect(matchesSkill('go', 'algorithm')).toBe(false);
      expect(matchesSkill('go', 'category')).toBe(false);
      expect(matchesSkill('java', 'javascript')).toBe(false);
      expect(matchesSkill('c', 'css')).toBe(false);
    });
  });

  describe('checkHardExclusions', () => {
    const baseCandidate: CandidateMatchingProfile = {
      userId: 'cand-1',
      skills: ['Go', 'Docker'],
      locations: ['Dhaka, Bangladesh'],
      remotePreference: 'FULLY_REMOTE',
      minSalary: 200000,
      currency: 'BDT',
    };

    const activeJob: CatalogJobResponse = {
      id: 'job-1',
      title: 'Backend Engineer',
      company: 'Tech Corp',
      location: 'Dhaka, Bangladesh',
      remote_eligibility: 'FULLY_REMOTE',
      seniority: 'SENIOR',
      status: 'ACTIVE',
      is_expired: false,
      salary: { min: 250000, max: 300000, currency: 'BDT' },
    };

    it('allows eligible job passing all constraints', () => {
      const result = checkHardExclusions(baseCandidate, activeJob, new Set());
      expect(result.eligible).toBe(true);
      expect(result.exclusionReason).toBeUndefined();
    });

    it('excludes candidate-dismissed jobs', () => {
      const dismissed = new Set(['job-1']);
      const result = checkHardExclusions(baseCandidate, activeJob, dismissed);
      expect(result.eligible).toBe(false);
      expect(result.exclusionReason).toBe('DISMISSED_BY_CANDIDATE');
    });

    it('excludes inactive and expired jobs', () => {
      const inactive = { ...activeJob, status: 'DRAFT' };
      expect(
        checkHardExclusions(baseCandidate, inactive, new Set()).eligible,
      ).toBe(false);

      const expired = { ...activeJob, is_expired: true };
      expect(
        checkHardExclusions(baseCandidate, expired, new Set()).eligible,
      ).toBe(false);

      const pastExpiry = {
        ...activeJob,
        expires_at: new Date(Date.now() - 60000).toISOString(),
      };
      expect(
        checkHardExclusions(baseCandidate, pastExpiry, new Set()).eligible,
      ).toBe(false);
    });

    it('excludes on-site jobs when candidate strictly requests FULLY_REMOTE', () => {
      const onSiteJob: CatalogJobResponse = {
        ...activeJob,
        remote_eligibility: 'ON_SITE',
      };
      const result = checkHardExclusions(baseCandidate, onSiteJob, new Set());
      expect(result.eligible).toBe(false);
      expect(result.exclusionReason).toBe('REMOTE_PREFERENCE_MISMATCH');
    });

    it('excludes location mismatch when candidate requires ON_SITE in Dhaka and job is in Chittagong', () => {
      const onSiteCandidate: CandidateMatchingProfile = {
        ...baseCandidate,
        remotePreference: 'ON_SITE',
        locations: ['Dhaka'],
      };
      const chittagongJob: CatalogJobResponse = {
        ...activeJob,
        location: 'Chittagong, Bangladesh',
        remote_eligibility: 'ON_SITE',
      };
      const result = checkHardExclusions(
        onSiteCandidate,
        chittagongJob,
        new Set(),
      );
      expect(result.eligible).toBe(false);
      expect(result.exclusionReason).toBe('LOCATION_MISMATCH');
    });

    it('excludes jobs offering below candidate minimum salary for matching currency', () => {
      const lowSalaryJob: CatalogJobResponse = {
        ...activeJob,
        salary: { min: 100000, max: 150000, currency: 'BDT' }, // Below 200,000 BDT
      };
      const result = checkHardExclusions(
        baseCandidate,
        lowSalaryJob,
        new Set(),
      );
      expect(result.eligible).toBe(false);
      expect(result.exclusionReason).toBe('SALARY_BELOW_MINIMUM');
    });

    it('does NOT exclude jobs with undisclosed salary or differing currency', () => {
      const undisclosedJob: CatalogJobResponse = {
        ...activeJob,
        salary: undefined,
      };
      expect(
        checkHardExclusions(baseCandidate, undisclosedJob, new Set()).eligible,
      ).toBe(true);

      const usdJob: CatalogJobResponse = {
        ...activeJob,
        salary: { min: 2000, max: 3000, currency: 'USD' }, // USD vs BDT: cannot compare directly, treated as unknown
      };
      expect(
        checkHardExclusions(baseCandidate, usdJob, new Set()).eligible,
      ).toBe(true);
    });
  });

  describe('scoreJob & Grounded Explanations', () => {
    const candidate: CandidateMatchingProfile = {
      userId: 'cand-2',
      skills: ['Go', 'Kubernetes', 'PostgreSQL'],
      title: 'Senior Distributed Systems Engineer',
      locations: ['Dhaka, Bangladesh'],
      remotePreference: 'FULLY_REMOTE',
      minSalary: 250000,
      currency: 'BDT',
    };

    it('computes higher scores for strong skill, title, and remote overlap', () => {
      const targetJob = STANDALONE_SEED_JOBS[0]; // Senior Distributed Systems Engineer (Go, K8s, Postgres)
      const { score, matchReasons } = scoreJob(candidate, targetJob);

      expect(score).toBeGreaterThanOrEqual(75);
      expect(matchReasons.matched_skills).toContain('Go');
      expect(matchReasons.matched_skills).toContain('Kubernetes');
      expect(matchReasons.matched_skills).toContain('PostgreSQL');
      expect(matchReasons.seniority_reason).toContain('senior');
      expect(matchReasons.compensation_reason).toContain(
        'Meets your minimum salary requirement',
      );
    });

    it('modifies reasons and scores when a single input changes', () => {
      const job = STANDALONE_SEED_JOBS[0];

      // Snapshot 1: candidate has Go, Kubernetes, PostgreSQL
      const score1 = scoreJob(candidate, job);

      // Snapshot 2: candidate removes Kubernetes and changes desired location to Sylhet
      const candidate2: CandidateMatchingProfile = {
        ...candidate,
        skills: ['Go'],
        locations: ['Sylhet'],
        remotePreference: 'ON_SITE',
      };
      const score2 = scoreJob(candidate2, job);

      expect(score2.score).toBeLessThan(score1.score);
      expect(score2.matchReasons.matched_skills).not.toContain('Kubernetes');
      expect(score2.matchReasons.matched_skills).toContain('Go');
      expect(score2.matchReasons.location_reason).not.toBe(
        score1.matchReasons.location_reason,
      );
    });

    it('produces honest cold-start explanations when candidate has zero reviewed skills', () => {
      const coldCandidate: CandidateMatchingProfile = {
        userId: 'cand-cold',
        skills: [],
        locations: [],
        remotePreference: 'UNSPECIFIED',
        currency: 'BDT',
      };

      const job = STANDALONE_SEED_JOBS[0];
      const { score, matchReasons } = scoreJob(coldCandidate, job);

      expect(score).toBeLessThanOrEqual(50);
      expect(matchReasons.matched_skills).toHaveLength(0);
      expect(matchReasons.missing_skills.length).toBeGreaterThan(0);
      expect(matchReasons.overall_summary).toContain(
        'No overlapping skills detected',
      );
    });
  });

  describe('filterAndRankRecommendations', () => {
    it('deterministically sorts by score DESC, published_at DESC, id DESC', () => {
      const candidate: CandidateMatchingProfile = {
        userId: 'cand-sort',
        skills: ['TypeScript', 'React', 'Node.js'],
        title: 'Lead Fullstack TypeScript Architect',
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'FULLY_REMOTE',
        currency: 'BDT',
      };

      const { items } = filterAndRankRecommendations(
        candidate,
        STANDALONE_SEED_JOBS,
        new Set(),
      );

      expect(items.length).toBeGreaterThan(0);
      for (let i = 0; i < items.length - 1; i++) {
        expect(items[i].score).toBeGreaterThanOrEqual(items[i + 1].score);
      }
      // Top item should be the Lead Fullstack TypeScript Architect job
      expect(items[0].id).toBe('22222222-2222-4222-8222-222222222202');
      expect(items[0].algorithm_version).toBe(RECOMMENDATION_ALGORITHM_VERSION);
    });

    it('supports cursor-based pagination seamlessly', () => {
      const candidate: CandidateMatchingProfile = {
        userId: 'cand-page',
        skills: ['Go', 'TypeScript', 'React'],
        locations: ['Dhaka, Bangladesh'],
        remotePreference: 'UNSPECIFIED',
        currency: 'BDT',
      };

      // Page 1 with limit 2
      const page1 = filterAndRankRecommendations(
        candidate,
        STANDALONE_SEED_JOBS,
        new Set(),
        { limit: 2 },
      );
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      // Page 2 using cursor from Page 1
      const page2 = filterAndRankRecommendations(
        candidate,
        STANDALONE_SEED_JOBS,
        new Set(),
        { limit: 2, cursor: page1.nextCursor },
      );
      expect(page2.items).toHaveLength(2);
      // Items on page 2 must be different from page 1
      expect(page2.items[0].id).not.toBe(page1.items[0].id);
      expect(page2.items[0].id).not.toBe(page1.items[1].id);
    });
  });
});
