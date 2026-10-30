'use strict';

/**
 * Common tech skill aliases aligned with P10/P06 matching engine.
 */
const SKILL_ALIASES = {
  golang: 'go',
  go: 'golang',
  ts: 'typescript',
  typescript: 'ts',
  js: 'javascript',
  javascript: 'js',
  py: 'python',
  python: 'py',
  k8s: 'kubernetes',
  kubernetes: 'k8s',
  postgres: 'postgresql',
  postgresql: 'postgres',
  reactjs: 'react',
  'react.js': 'react',
  react: 'reactjs',
  nextjs: 'next.js',
  'next.js': 'nextjs',
};

const SUPPORTED_PERIODS = ['HOURLY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'ANNUAL'];

/**
 * Escapes characters for regular expression.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes salary to a monthly baseline.
 * Returns null if amount or period is invalid.
 */
function toMonthlySalary(amount, period = 'MONTHLY') {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return null;
  const p = (period || 'MONTHLY').toUpperCase().trim();
  if (!SUPPORTED_PERIODS.includes(p)) return null;

  if (p === 'HOURLY') return amount * 160;
  if (p === 'WEEKLY') return amount * 4.33;
  if (p === 'YEARLY' || p === 'ANNUAL') return amount / 12;
  return amount; // default MONTHLY
}

/**
 * Checks if a token matches within a searchable text, accounting for punctuation-heavy tokens (C++, .NET, Node.js).
 */
function tokenMatchesText(token, searchableText) {
  const t = token.toLowerCase().trim();
  if (!t) return false;

  // 1. Check direct token boundary
  const hasPunctuation = /[+#.]/.test(t);
  let regex;
  if (hasPunctuation) {
    regex = new RegExp(`(?:^|[\\s,;()[\\]{}/<>])${escapeRegex(t)}(?:$|[\\s,;()[\\]{}/<>])`, 'i');
  } else {
    regex = new RegExp(`\\b${escapeRegex(t)}\\b`, 'i');
  }

  if (regex.test(searchableText)) {
    return true;
  }

  // 2. Check alias if available
  const alias = SKILL_ALIASES[t];
  if (alias) {
    const aliasHasPunctuation = /[+#.]/.test(alias);
    const aliasRegex = aliasHasPunctuation
      ? new RegExp(`(?:^|[\\s,;()[\\]{}/<>])${escapeRegex(alias)}(?:$|[\\s,;()[\\]{}/<>])`, 'i')
      : new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
    if (aliasRegex.test(searchableText)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a candidate alert subscription matches an ingested job.
 *
 * @param {Object} job - Standardized job object
 * @param {Object} sub - Candidate alert subscription
 * @param {Object} [context]
 * @param {Function} [context.isSuppressed] - Checks if email/sub is suppressed
 * @param {Set<string>|Array<string>} [context.dismissals] - Job IDs dismissed by candidate
 * @returns {{ matches: boolean, reason?: string, details?: Object }}
 */
function evaluateJobMatch(job, sub, context = {}) {
  if (!job || typeof job !== 'object') {
    return { matches: false, reason: 'INVALID_JOB_PAYLOAD' };
  }
  if (!sub || typeof sub !== 'object') {
    return { matches: false, reason: 'INVALID_SUBSCRIPTION' };
  }

  // 1. Subscription active status (Strict explicit boolean true)
  if (sub.active !== true) {
    return { matches: false, reason: 'SUBSCRIPTION_PAUSED' };
  }

  // 2. Email verification (Strict explicit boolean true - missing or false rejects)
  if (sub.email_verified !== true && sub.emailVerified !== true) {
    return { matches: false, reason: 'EMAIL_NOT_VERIFIED' };
  }

  // 3. Suppression check
  const recipientEmail = (sub.email || '').toLowerCase().trim();
  if (context.isSuppressed && context.isSuppressed(recipientEmail, sub.id)) {
    return { matches: false, reason: 'RECIPIENT_SUPPRESSED' };
  }

  // 4. Dismissal check
  if (context.dismissals) {
    const dismissed =
      context.dismissals instanceof Set
        ? context.dismissals.has(job.id)
        : Array.isArray(context.dismissals) && context.dismissals.includes(job.id);
    if (dismissed) {
      return { matches: false, reason: 'JOB_DISMISSED' };
    }
  }

  // 5. Job Status & Expiration checks
  if (job.status && job.status !== 'ACTIVE') {
    return { matches: false, reason: 'JOB_NOT_ACTIVE' };
  }
  if (job.is_expired === true) {
    return { matches: false, reason: 'JOB_EXPIRED' };
  }
  if (job.expires_at) {
    const expiryTime = new Date(job.expires_at).getTime();
    if (!isNaN(expiryTime) && expiryTime <= Date.now()) {
      return { matches: false, reason: 'JOB_EXPIRED' };
    }
  }

  // 6. Strict Remote Preference Check
  const subRemote = (sub.remote_preference || sub.remotePreference || '').toUpperCase().trim();
  const jobRemote = (job.remote_eligibility || job.workplace_type || '').toUpperCase().trim();
  const isJobRemote = jobRemote === 'FULLY_REMOTE' || jobRemote === 'REMOTE';

  if (subRemote === 'FULLY_REMOTE') {
    if (!isJobRemote) {
      return {
        matches: false,
        reason: 'REMOTE_PREFERENCE_MISMATCH',
        details: { expected: 'FULLY_REMOTE', actual: job.remote_eligibility || 'ON_SITE' },
      };
    }
  }

  // 7. Location Check
  const subLocation = (sub.location || '').trim();
  if (subLocation && subRemote !== 'FULLY_REMOTE') {
    // If the job is on-site or hybrid, candidate location must match job location
    if (!isJobRemote) {
      const jobLoc = (job.location || '').toLowerCase();
      const targetLoc = subLocation.toLowerCase();
      const locRegex = new RegExp(`\\b${escapeRegex(targetLoc)}\\b`, 'i');
      if (!locRegex.test(jobLoc) && !jobLoc.includes(targetLoc)) {
        return {
          matches: false,
          reason: 'LOCATION_MISMATCH',
          details: { expected: subLocation, actual: job.location },
        };
      }
    }
  }

  // 8. Compensation Check
  const minRequired = sub.min_salary || sub.minSalary;
  if (typeof minRequired === 'number' && minRequired > 0) {
    const subCurrency = (sub.currency || 'USD').toUpperCase().trim();
    const subPeriod = (sub.pay_period || sub.payPeriod || 'MONTHLY').toUpperCase().trim();
    const subRequiredMonthly = toMonthlySalary(minRequired, subPeriod);

    if (subRequiredMonthly === null) {
      return { matches: false, reason: 'INVALID_SUBSCRIPTION_SALARY_PERIOD' };
    }

    if (job.salary && typeof job.salary === 'object') {
      const jobCurrency = (job.salary.currency || 'USD').toUpperCase().trim();
      const jobPeriod = (job.salary.pay_period || job.salary.period || 'MONTHLY').toUpperCase().trim();
      const jobMax = job.salary.max || job.salary.min || 0;
      const jobMaxMonthly = toMonthlySalary(jobMax, jobPeriod);

      if (jobMaxMonthly === null) {
        return { matches: false, reason: 'UNSUPPORTED_JOB_SALARY_PERIOD' };
      }

      if (jobCurrency !== subCurrency) {
        return {
          matches: false,
          reason: 'SALARY_CURRENCY_MISMATCH',
          details: { expectedCurrency: subCurrency, jobCurrency },
        };
      }

      if (jobMaxMonthly < subRequiredMonthly) {
        return {
          matches: false,
          reason: 'SALARY_BELOW_MINIMUM',
          details: { requiredMonthly: subRequiredMonthly, actualMonthly: jobMaxMonthly },
        };
      }
    }
  }

  // 9. Query & Keyword Check (Token boundary + alias matching)
  const query = (sub.query || '').trim();
  if (query) {
    const searchableParts = [
      job.title || '',
      job.company || '',
      job.description || '',
      job.role_family || '',
      Array.isArray(job.skills) ? job.skills.join(' ') : (job.skills || ''),
    ];
    const searchableText = searchableParts.join(' ').toLowerCase();

    // Split query into significant tokens (length >= 2, or special tokens like C#)
    const tokens = query
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 || ['c', 'r'].includes(t.toLowerCase()));

    if (tokens.length > 0) {
      const allTokensMatch = tokens.every((token) => tokenMatchesText(token, searchableText));

      if (!allTokensMatch) {
        return {
          matches: false,
          reason: 'QUERY_NO_MATCH',
          details: { query, tokens },
        };
      }
    }
  }

  return {
    matches: true,
    reason: 'MATCH_CRITERIA_SATISFIED',
    details: {
      matchedQuery: query,
      matchedJobId: job.id,
      jobTitle: job.title,
    },
  };
}

module.exports = {
  evaluateJobMatch,
  toMonthlySalary,
  tokenMatchesText,
  SKILL_ALIASES,
};
