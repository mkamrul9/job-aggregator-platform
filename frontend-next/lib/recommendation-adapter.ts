/**
 * Deterministic Explainable Recommendation Engine & Adapter (Frontend)
 * Algorithm Version: v1.0.0-deterministic
 *
 * Implements identical deterministic matching and explainability rules as service-user.
 * Grounded in candidate profile attributes and canonical/synthetic job attributes.
 */

import type { JobSummary, JobDetail, RecommendedJob, MatchReasons } from './mock-data.ts';
export type { RecommendedJob, MatchReasons };

export const RECOMMENDATION_ALGORITHM_VERSION = 'v1.0.0-deterministic';

export interface CandidateMatchingInput {
  userId?: string;
  skills: string[]; // Reviewed candidate skills
  title?: string | null;
  locations: string[];
  remotePreference: string; // FULLY_REMOTE, HYBRID, ON_SITE, UNSPECIFIED
  minSalary?: number | null;
  currency: string;
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

export function normalizeMonthlySalary(
  salary?: JobSummary['salary'],
): { min?: number; max?: number; currency?: string } | null {
  if (!salary) return null;
  const period = (salary.period || 'MONTHLY').toUpperCase();
  const divisor = period === 'YEARLY' ? 12 : 1;

  return {
    min: salary.min !== undefined ? Math.round(salary.min / divisor) : undefined,
    max: salary.max !== undefined ? Math.round(salary.max / divisor) : undefined,
    currency: (salary.currency || 'BDT').toUpperCase(),
  };
}

export function checkHardExclusions(
  candidate: CandidateMatchingInput,
  job: JobSummary | JobDetail,
  dismissedIds: Set<string>,
): { eligible: boolean; exclusionReason?: string } {
  // 1. Candidate dismissed
  if (dismissedIds.has(job.id)) {
    return { eligible: false, exclusionReason: 'DISMISSED_BY_CANDIDATE' };
  }

  // 2. Status & Expiration (Rejects FLAGGED, DRAFT, EXPIRED)
  const jobDetail = job as JobDetail;
  if (jobDetail.status && jobDetail.status !== 'ACTIVE') {
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
  const candRemote = (candidate.remotePreference || 'UNSPECIFIED').toUpperCase();

  // Strict constraint: if candidate requires FULLY_REMOTE, reject ON_SITE and HYBRID
  if (candRemote === 'FULLY_REMOTE' && (jobRemote === 'ON_SITE' || jobRemote === 'HYBRID')) {
    return { eligible: false, exclusionReason: 'REMOTE_PREFERENCE_MISMATCH' };
  }

  // Strict constraint: if candidate requires ON_SITE in specific cities
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

export function scoreJob(
  candidate: CandidateMatchingInput,
  job: JobSummary | JobDetail,
): { score: number; matchReasons: MatchReasons } {
  let score = 0;
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  const candSkills = deduplicateSkills(candidate.skills || []);
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
        score += 15;
      }
    }
  } else {
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
        : candTitle.includes('junior') || candTitle.includes('entry') || candTitle.includes('intern')
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
      score += 5;
      seniorityReason = `Role seniority is ${jobSeniority.toLowerCase()} (seniority preference not specified on your profile)`;
    }
  }

  // 4. Location & Remote Scoring (0-10 pts)
  let locationReason = 'Location alignment not specified';
  const candRemote = (candidate.remotePreference || 'UNSPECIFIED').toUpperCase();
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
        score += 2;
        compReason = `Salary disclosed in ${normSal.currency} (differs from your preferred ${candCurr} currency; not directly comparable)`;
      }
    } else {
      score += 2;
      compReason = 'Disclosed compensation';
    }
  }

  score = Math.max(0, Math.min(100, score));

  const skillSummary =
    matchedSkills.length > 0
      ? `Matches ${matchedSkills.length} of your reviewed skills (${matchedSkills.slice(0, 3).join(', ')})`
      : 'No overlapping skills detected with your reviewed profile';
  const overallSummary = `${skillSummary}. ${locationReason}.`;

  const matchReasons: MatchReasons = {
    matched_skills: matchedSkills,
    missing_skills: missingSkills.slice(0, 5),
    location_reason: locationReason,
    seniority_reason: seniorityReason,
    compensation_reason: compReason,
    overall_summary: overallSummary,
  };

  return { score, matchReasons };
}

export function computeDemoRecommendations(
  candidate: CandidateMatchingInput,
  jobs: (JobSummary | JobDetail)[],
  dismissedIds: Set<string>,
): { items: RecommendedJob[]; isColdStart: boolean } {
  const eligible: RecommendedJob[] = [];

  for (const job of jobs) {
    const hard = checkHardExclusions(candidate, job, dismissedIds);
    if (!hard.eligible) continue;

    const { score, matchReasons } = scoreJob(candidate, job);
    eligible.push({
      ...job,
      score,
      match_reasons: matchReasons,
      algorithm_version: RECOMMENDATION_ALGORITHM_VERSION,
      is_available: true,
    });
  }

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const timeA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const timeB = b.published_at ? new Date(b.published_at).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return b.id.localeCompare(a.id);
  });

  const isColdStart = (candidate.skills.length === 0 && !candidate.title);
  return { items: eligible, isColdStart };
}
