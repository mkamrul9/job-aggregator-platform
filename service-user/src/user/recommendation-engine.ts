/**
 * Deterministic Explainable Recommendation Engine
 * Algorithm Version: v1.0.0-deterministic
 *
 * Grounded strictly in candidate-reviewed profile attributes and canonical job data.
 * No black-box machine learning, no fabricated hiring probabilities.
 */

import { BadRequestException } from '@nestjs/common';
import {
  CatalogJobResponse,
  CatalogSalary,
  MatchReasonsDto,
  RecommendedJobDto,
} from './dto/workspace.dto';

export const RECOMMENDATION_ALGORITHM_VERSION = 'v1.0.0-deterministic';

export interface CandidateMatchingProfile {
  userId: string;
  skills: string[]; // Strictly reviewed candidate skills
  title?: string | null;
  locations: string[];
  remotePreference: string; // FULLY_REMOTE, HYBRID, ON_SITE, UNSPECIFIED
  minSalary?: number | null;
  currency: string;
  updatedAt?: Date | string;
}

export const SKILL_ALIASES: Record<string, string[]> = {
  go: ['golang', 'go-lang'],
  golang: ['go', 'go-lang'],
  react: ['reactjs', 'react.js'],
  reactjs: ['react', 'react.js'],
  'react.js': ['react', 'reactjs'],
  node: ['nodejs', 'node.js'],
  nodejs: ['node', 'node.js'],
  'node.js': ['node', 'nodejs'],
  typescript: ['ts'],
  ts: ['typescript'],
  javascript: ['js', 'ecmascript'],
  js: ['javascript'],
  python: ['py', 'python3'],
  py: ['python'],
  postgres: ['postgresql', 'psql'],
  postgresql: ['postgres', 'psql'],
  k8s: ['kubernetes'],
  kubernetes: ['k8s'],
  docker: ['containers', 'dockerfile'],
  aws: ['amazon web services', 'amazon-web-services'],
  gcp: ['google cloud', 'google-cloud', 'google cloud platform'],
  'next.js': ['nextjs', 'next'],
  nextjs: ['next.js', 'next'],
  vue: ['vue.js', 'vuejs'],
  vuejs: ['vue', 'vue.js'],
  angular: ['angularjs', 'angular.io'],
  graphql: ['gql'],
  redis: ['key-value store'],
  kafka: ['apache kafka'],
};

export function normalizeSkill(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Deduplicates and canonicalizes candidate or job skill lists.
 */
export function deduplicateSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of skills) {
    const norm = normalizeSkill(s);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    result.push(s.trim());
  }
  return result;
}

/**
 * Checks whether candidate skill and job skill match directly or via documented alias.
 * Uses exact token matching to avoid substring pitfalls (e.g. "go" in "django" or "algorithm").
 */
export function matchesSkill(
  candidateSkill: string,
  jobSkill: string,
): boolean {
  const c = normalizeSkill(candidateSkill);
  const j = normalizeSkill(jobSkill);
  if (!c || !j) return false;
  if (c === j) return true;
  if (SKILL_ALIASES[c]?.includes(j)) return true;
  if (SKILL_ALIASES[j]?.includes(c)) return true;
  return false;
}

/**
 * Normalizes salary amounts into monthly units within the same currency.
 */
export function normalizeMonthlySalary(
  salary?: CatalogSalary | string,
): { min?: number; max?: number; currency?: string } | null {
  if (!salary) return null;
  if (typeof salary === 'string') {
    return null;
  }
  const period = (salary.period || 'MONTHLY').toUpperCase();
  const divisor = period === 'YEARLY' ? 12 : 1;

  return {
    min:
      salary.min !== undefined ? Math.round(salary.min / divisor) : undefined,
    max:
      salary.max !== undefined ? Math.round(salary.max / divisor) : undefined,
    currency: (salary.currency || 'BDT').toUpperCase(),
  };
}

export interface HardExclusionResult {
  eligible: boolean;
  exclusionReason?: string;
}

/**
 * Evaluates whether a job passes all candidate hard constraints.
 */
export function checkHardExclusions(
  candidate: CandidateMatchingProfile,
  job: CatalogJobResponse,
  dismissedIds: Set<string>,
): HardExclusionResult {
  // 1. Candidate feedback: dismissed jobs are excluded
  if (dismissedIds.has(job.id)) {
    return { eligible: false, exclusionReason: 'DISMISSED_BY_CANDIDATE' };
  }

  // 2. Active status and expiration (rejects FLAGGED, DRAFT, EXPIRED, etc.)
  if (job.status && job.status !== 'ACTIVE') {
    return { eligible: false, exclusionReason: 'JOB_INACTIVE' };
  }
  if (job.is_expired) {
    return { eligible: false, exclusionReason: 'JOB_EXPIRED' };
  }
  if (job.expires_at) {
    const expiresMs = new Date(job.expires_at).getTime();
    if (!isNaN(expiresMs) && expiresMs < Date.now()) {
      return { eligible: false, exclusionReason: 'JOB_EXPIRED' };
    }
  }

  // 3. Remote / Location Hard Constraints
  const jobRemote = (job.remote_eligibility || 'UNSPECIFIED').toUpperCase();
  const candRemote = (
    candidate.remotePreference || 'UNSPECIFIED'
  ).toUpperCase();

  // Strict constraint: if candidate requires FULLY_REMOTE, reject ON_SITE and HYBRID
  if (
    candRemote === 'FULLY_REMOTE' &&
    (jobRemote === 'ON_SITE' || jobRemote === 'HYBRID')
  ) {
    return { eligible: false, exclusionReason: 'REMOTE_PREFERENCE_MISMATCH' };
  }

  // Strict constraint: if candidate requires ON_SITE in specific cities, reject different cities unless remote
  if (
    candRemote === 'ON_SITE' &&
    candidate.locations &&
    candidate.locations.length > 0
  ) {
    const jobLoc = (job.location || '').toLowerCase();
    const matchesAnyLoc = candidate.locations.some((loc) =>
      jobLoc.includes(loc.toLowerCase()),
    );
    if (!matchesAnyLoc && jobRemote !== 'FULLY_REMOTE') {
      return { eligible: false, exclusionReason: 'LOCATION_MISMATCH' };
    }
  }

  // 4. Compensation Hard Constraints with Period Normalization
  if (candidate.minSalary && candidate.minSalary > 0 && job.salary) {
    const normSal = normalizeMonthlySalary(job.salary);
    if (normSal && normSal.currency) {
      const candCurr = (candidate.currency || 'BDT').toUpperCase();
      // Compare strictly if currencies match; do not invent FX conversions
      if (normSal.currency === candCurr) {
        const effectiveCap = normSal.max ?? normSal.min;
        if (effectiveCap !== undefined && effectiveCap < candidate.minSalary) {
          return { eligible: false, exclusionReason: 'SALARY_BELOW_MINIMUM' };
        }
      }
    }
  }

  return { eligible: true };
}

/**
 * Calculates deterministic match score (0-100) and structured, explainable reasons.
 */
export function scoreJob(
  candidate: CandidateMatchingProfile,
  job: CatalogJobResponse,
): { score: number; matchReasons: MatchReasonsDto } {
  let score = 0;
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  const rawCandSkills = candidate.skills || [];
  const candSkills = deduplicateSkills(rawCandSkills);
  const jobDeclaredSkills = deduplicateSkills(job.skills || []);

  // 1. Skill Scoring (0-50 pts)
  if (candSkills.length > 0) {
    for (const jSkill of jobDeclaredSkills) {
      const hasMatch = candSkills.some((cSkill) =>
        matchesSkill(cSkill, jSkill),
      );
      if (hasMatch) {
        matchedSkills.push(jSkill);
      } else {
        missingSkills.push(jSkill);
      }
    }

    if (jobDeclaredSkills.length > 0) {
      const matchRatio =
        matchedSkills.length / Math.min(jobDeclaredSkills.length, 5);
      const skillScore = Math.min(50, Math.round(matchRatio * 50));
      score += skillScore;
    } else {
      const jobTitleTokens = (job.title || '')
        .toLowerCase()
        .split(/[^a-z0-9#+.]+/);
      const titleMatches = candSkills.filter((c) => {
        const cNorm = normalizeSkill(c);
        return (
          jobTitleTokens.includes(cNorm) ||
          (SKILL_ALIASES[cNorm] || []).some((alias) =>
            jobTitleTokens.includes(alias),
          )
        );
      });
      if (titleMatches.length > 0) {
        matchedSkills.push(...titleMatches);
        score += Math.min(40, titleMatches.length * 20);
      } else {
        score += 15; // neutral baseline when listing has unpopulated skill tags
      }
    }
  } else {
    // Candidate has no reviewed skills: cold-start
    missingSkills.push(...jobDeclaredSkills.slice(0, 5));
  }

  // 2. Role / Title Alignment (0-20 pts)
  const candTitle = (candidate.title || '').trim().toLowerCase();
  const jobTitle = (job.title || '').trim().toLowerCase();

  if (candTitle && jobTitle) {
    const stopWords = new Set([
      'engineer',
      'developer',
      'senior',
      'lead',
      'junior',
      'the',
      'at',
      'in',
      'and',
      'for',
      'to',
    ]);
    const candWords = candTitle
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
    const jobWords = new Set(
      jobTitle
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2 && !stopWords.has(w)),
    );

    let wordMatches = 0;
    for (const w of candWords) {
      if (jobWords.has(w)) wordMatches++;
    }
    if (wordMatches > 0) {
      score += Math.min(20, wordMatches * 10);
    }
  }

  // 3. Seniority Alignment (0-15 pts) - strictly ground claims
  let seniorityReason = 'Seniority not specified on listing';
  const jobSeniority = (job.seniority || '').toUpperCase();

  const candHasSeniority =
    candTitle.includes('lead') ||
    candTitle.includes('staff') ||
    candTitle.includes('principal')
      ? 'LEAD'
      : candTitle.includes('senior') || candTitle.includes('sr')
        ? 'SENIOR'
        : candTitle.includes('junior') ||
            candTitle.includes('entry') ||
            candTitle.includes('intern')
          ? 'JUNIOR'
          : candTitle.length > 0
            ? 'MID'
            : null;

  if (jobSeniority && jobSeniority !== 'UNSPECIFIED') {
    if (candHasSeniority) {
      if (jobSeniority === candHasSeniority) {
        score += 15;
        seniorityReason = `Matches your ${jobSeniority.toLowerCase()} level profile`;
      } else if (
        (candHasSeniority === 'SENIOR' && jobSeniority === 'LEAD') ||
        (candHasSeniority === 'MID' && jobSeniority === 'SENIOR') ||
        (candHasSeniority === 'JUNIOR' && jobSeniority === 'MID')
      ) {
        score += 8;
        seniorityReason = `Role seniority is ${jobSeniority.toLowerCase()} (adjacent to your experience)`;
      } else {
        score += 2;
        seniorityReason = `Role seniority is ${jobSeniority.toLowerCase()}`;
      }
    } else {
      // Truthful: candidate did NOT specify a seniority
      score += 5;
      seniorityReason = `Role seniority is ${jobSeniority.toLowerCase()} (seniority preference not specified on your profile)`;
    }
  }

  // 4. Location & Remote Scoring (0-10 pts)
  let locationReason = 'Location alignment not specified';
  const candRemote = (
    candidate.remotePreference || 'UNSPECIFIED'
  ).toUpperCase();
  const jobRemote = (job.remote_eligibility || 'UNSPECIFIED').toUpperCase();
  const jobLoc = job.location || 'Unspecified';

  if (candRemote === 'FULLY_REMOTE' && jobRemote === 'FULLY_REMOTE') {
    score += 10;
    locationReason = 'Fully remote position matching your remote preference';
  } else if (
    candidate.locations &&
    candidate.locations.length > 0 &&
    candidate.locations.some((loc) =>
      jobLoc.toLowerCase().includes(loc.toLowerCase()),
    )
  ) {
    if (jobRemote === 'HYBRID') {
      score += 8;
      locationReason = `Hybrid role in ${jobLoc}, matching your preferred city`;
    } else {
      score += 10;
      locationReason = `Located in ${jobLoc}, matching your preferred location`;
    }
  } else if (jobRemote === 'FULLY_REMOTE') {
    score += 6;
    locationReason = 'Remote role available';
  } else {
    score += 3;
    locationReason = `Location: ${jobLoc}`;
  }

  // 5. Compensation Scoring (0-5 pts) with Period Normalization
  let compReason = 'Compensation not disclosed on listing';
  if (job.salary) {
    const normSal = normalizeMonthlySalary(job.salary);
    const candCurr = (candidate.currency || 'BDT').toUpperCase();

    if (normSal && normSal.currency) {
      if (normSal.currency === candCurr) {
        if (candidate.minSalary && candidate.minSalary > 0) {
          if (normSal.min && normSal.min >= candidate.minSalary) {
            score += 5;
            compReason = `Meets your minimum salary requirement (${candidate.minSalary.toLocaleString()} ${candCurr}/mo)`;
          } else if (normSal.max && normSal.max >= candidate.minSalary) {
            score += 4;
            compReason = `Salary range reaches up to ${normSal.max.toLocaleString()} ${candCurr}/mo`;
          } else {
            compReason = `Salary range: ${normSal.min ?? 0} - ${normSal.max ?? 0} ${candCurr}/mo`;
          }
        } else {
          score += 3;
          compReason = `Disclosed compensation: ${normSal.min ?? 0} - ${normSal.max ?? 0} ${candCurr}/mo`;
        }
      } else {
        // Differing currency
        score += 2;
        compReason = `Salary disclosed in ${normSal.currency} (differs from your preferred ${candCurr} currency; not directly comparable)`;
      }
    } else {
      score += 2;
      compReason =
        typeof job.salary === 'string'
          ? `Disclosed compensation: ${job.salary}`
          : 'Disclosed compensation';
    }
  }

  score = Math.max(0, Math.min(100, score));

  const skillSummary =
    matchedSkills.length > 0
      ? `Matches ${matchedSkills.length} of your reviewed skills (${matchedSkills.slice(0, 3).join(', ')})`
      : 'No overlapping skills detected with your reviewed profile';
  const overallSummary = `${skillSummary}. ${locationReason}.`;

  const matchReasons: MatchReasonsDto = {
    matched_skills: matchedSkills,
    missing_skills: missingSkills.slice(0, 5),
    location_reason: locationReason,
    seniority_reason: seniorityReason,
    compensation_reason: compReason,
    overall_summary: overallSummary,
  };

  return { score, matchReasons };
}

export interface CursorPayload {
  ownerId: string;
  profileUpdatedAt?: string;
  algo: string;
  id: string;
  score: number;
  published_at?: string;
}

/**
 * Filter, score, and rank jobs deterministically for a candidate.
 */
export function filterAndRankRecommendations(
  candidate: CandidateMatchingProfile,
  allJobs: CatalogJobResponse[],
  dismissedIds: Set<string>,
  options?: { limit?: number; cursor?: string },
): { items: RecommendedJobDto[]; nextCursor?: string; totalCount: number } {
  const eligibleJobs: RecommendedJobDto[] = [];

  for (const job of allJobs) {
    const hardCheck = checkHardExclusions(candidate, job, dismissedIds);
    if (!hardCheck.eligible) {
      continue;
    }

    const { score, matchReasons } = scoreJob(candidate, job);

    eligibleJobs.push({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      remote_eligibility: job.remote_eligibility,
      seniority: job.seniority,
      job_type: job.job_type,
      salary: job.salary,
      skills: job.skills,
      source: job.source,
      canonical_url: job.canonical_url,
      job_url: job.job_url,
      score,
      match_reasons: matchReasons,
      algorithm_version: RECOMMENDATION_ALGORITHM_VERSION,
      is_available: true,
      is_expired: false,
      published_at: job.published_at,
    });
  }

  // Deterministic sort: score DESC, published_at DESC, id DESC
  eligibleJobs.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return b.id.localeCompare(a.id);
  });

  const totalCount = eligibleJobs.length;
  const limit = options?.limit && options.limit > 0 ? options.limit : 10;

  let startIndex = 0;
  if (options?.cursor) {
    let decoded: CursorPayload;
    try {
      const decodedRaw: unknown = JSON.parse(
        Buffer.from(options.cursor, 'base64').toString('utf8'),
      );
      decoded = decodedRaw as CursorPayload;
      if (!decoded || typeof decoded.id !== 'string') {
        throw new Error('Missing job ID');
      }
    } catch {
      throw new BadRequestException('Invalid or malformed pagination cursor.');
    }

    // Ownership check: cursor must belong to authenticated candidate
    if (decoded.ownerId !== candidate.userId) {
      throw new BadRequestException('Cursor owner mismatch.');
    }

    // Algorithm version check
    if (decoded.algo !== RECOMMENDATION_ALGORITHM_VERSION) {
      throw new BadRequestException(
        'Recommendation algorithm version mismatch. Please refresh recommendations.',
      );
    }

    // Candidate profile version / invalidation check
    if (
      candidate.updatedAt &&
      decoded.profileUpdatedAt &&
      decoded.profileUpdatedAt !== String(candidate.updatedAt)
    ) {
      throw new BadRequestException(
        'Candidate preferences changed since cursor issuance. Please refresh recommendations.',
      );
    }

    const cursorIndex = eligibleJobs.findIndex((j) => j.id === decoded.id);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    } else {
      // If cursor job was deleted or no longer eligible, locate by tie-breaker tuple
      const fallbackIdx = eligibleJobs.findIndex((j) => {
        if (j.score < decoded.score) return true;
        if (j.score === decoded.score && decoded.published_at) {
          const tJ = j.published_at ? new Date(j.published_at).getTime() : 0;
          const tD = new Date(decoded.published_at).getTime();
          return tJ < tD;
        }
        return false;
      });
      startIndex = fallbackIdx !== -1 ? fallbackIdx : eligibleJobs.length;
    }
  }

  const pagedItems = eligibleJobs.slice(startIndex, startIndex + limit);
  let nextCursor: string | undefined;

  if (startIndex + limit < eligibleJobs.length) {
    const lastItem = pagedItems[pagedItems.length - 1];
    const cursorObj: CursorPayload = {
      ownerId: candidate.userId,
      profileUpdatedAt: candidate.updatedAt
        ? String(candidate.updatedAt)
        : undefined,
      algo: RECOMMENDATION_ALGORITHM_VERSION,
      id: lastItem.id,
      score: lastItem.score,
      published_at: lastItem.published_at,
    };
    nextCursor = Buffer.from(JSON.stringify(cursorObj)).toString('base64');
  }

  return { items: pagedItems, nextCursor, totalCount };
}

/**
 * Curated seed catalog of canonical active jobs with valid UUIDs for isolated tests.
 */
export const STANDALONE_SEED_JOBS: CatalogJobResponse[] = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    title: 'Senior Distributed Systems Engineer',
    company: 'Dhaka Cloud Labs',
    location: 'Dhaka, Bangladesh',
    remote_eligibility: 'HYBRID',
    seniority: 'SENIOR',
    job_type: 'FULL_TIME',
    salary: { min: 250000, max: 350000, currency: 'BDT', period: 'MONTHLY' },
    skills: ['Go', 'Kubernetes', 'PostgreSQL', 'Docker', 'Distributed Systems'],
    source: 'pathao',
    canonical_url: 'https://careers.example.com/jobs/dist-sys-1',
    published_at: '2026-10-25T10:00:00Z',
    status: 'ACTIVE',
    is_expired: false,
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    title: 'Lead Fullstack TypeScript Architect',
    company: 'Fintech Bengal',
    location: 'Dhaka, Bangladesh',
    remote_eligibility: 'FULLY_REMOTE',
    seniority: 'LEAD',
    job_type: 'FULL_TIME',
    salary: { min: 300000, max: 450000, currency: 'BDT', period: 'MONTHLY' },
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'GraphQL'],
    source: 'greenhouse',
    canonical_url: 'https://careers.example.com/jobs/ts-lead-2',
    published_at: '2026-10-24T12:00:00Z',
    status: 'ACTIVE',
    is_expired: false,
  },
  {
    id: '33333333-3333-4333-8333-333333333303',
    title: 'Frontend React Developer',
    company: 'Bengal Interface Studio',
    location: 'Dhaka, Bangladesh',
    remote_eligibility: 'HYBRID',
    seniority: 'MID',
    job_type: 'FULL_TIME',
    salary: { min: 140000, max: 200000, currency: 'BDT', period: 'MONTHLY' },
    skills: ['React', 'JavaScript', 'TypeScript', 'Next.js', 'Tailwind CSS'],
    source: 'lever',
    canonical_url: 'https://careers.example.com/jobs/fe-react-3',
    published_at: '2026-10-23T09:00:00Z',
    status: 'ACTIVE',
    is_expired: false,
  },
  {
    id: '44444444-4444-4444-8444-444444444404',
    title: 'Data Platform Engineer',
    company: 'Analytics BD',
    location: 'Dhaka, Bangladesh',
    remote_eligibility: 'FULLY_REMOTE',
    seniority: 'MID',
    job_type: 'FULL_TIME',
    salary: { min: 180000, max: 260000, currency: 'BDT', period: 'MONTHLY' },
    skills: ['Python', 'PostgreSQL', 'Kafka', 'Docker', 'Airflow'],
    source: 'ashby',
    canonical_url: 'https://careers.example.com/jobs/data-eng-4',
    published_at: '2026-10-22T08:00:00Z',
    status: 'ACTIVE',
    is_expired: false,
  },
  {
    id: '55555555-5555-4555-8555-555555555505',
    title: 'Junior Go Backend Engineer',
    company: 'Microservices Asia',
    location: 'Chittagong, Bangladesh',
    remote_eligibility: 'ON_SITE',
    seniority: 'JUNIOR',
    job_type: 'FULL_TIME',
    salary: { min: 80000, max: 120000, currency: 'BDT', period: 'MONTHLY' },
    skills: ['Go', 'Docker', 'PostgreSQL'],
    source: 'workable',
    canonical_url: 'https://careers.example.com/jobs/jr-go-5',
    published_at: '2026-10-21T14:00:00Z',
    status: 'ACTIVE',
    is_expired: false,
  },
  {
    id: '66666666-6666-4666-8666-666666666606',
    title: 'Staff DevOps / SRE Architect',
    company: 'Global Cloud Systems',
    location: 'Remote, US',
    remote_eligibility: 'FULLY_REMOTE',
    seniority: 'LEAD',
    job_type: 'FULL_TIME',
    salary: { min: 150000, max: 220000, currency: 'USD', period: 'YEARLY' },
    skills: ['Kubernetes', 'AWS', 'Terraform', 'Docker', 'Go'],
    source: 'greenhouse',
    canonical_url: 'https://careers.example.com/jobs/sre-staff-6',
    published_at: '2026-10-20T11:00:00Z',
    status: 'ACTIVE',
    is_expired: false,
  },
];
