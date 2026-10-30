'use strict';

/**
 * Escapes string for regular expression.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes salary to monthly baseline.
 *
 * @param {number} amount
 * @param {string} [period='MONTHLY'] - HOURLY, WEEKLY, MONTHLY, YEARLY
 * @returns {number}
 */
function toMonthlySalary(amount, period = 'MONTHLY') {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return 0;
  const p = (period || 'MONTHLY').toUpperCase();
  if (p === 'HOURLY') return amount * 160;
  if (p === 'WEEKLY') return amount * 4.33;
  if (p === 'YEARLY' || p === 'ANNUAL') return amount / 12;
  return amount; // default MONTHLY
}

/**
 * Evaluates whether a candidate alert subscription matches an ingested job.
 *
 * @param {Object} job - Standardized job object
 * @param {Object} sub - Candidate alert subscription
 * @param {Object} [context]
 * @param {Function} [context.isSuppressed] - Checks if email is suppressed
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

  // 1. Subscription active status
  if (sub.active === false) {
    return { matches: false, reason: 'SUBSCRIPTION_PAUSED' };
  }

  // 2. Email verification
  if (sub.email_verified === false) {
    return { matches: false, reason: 'EMAIL_NOT_VERIFIED' };
  }

  // 3. Suppression check
  const recipientEmail = (sub.email || '').toLowerCase().trim();
  if (context.isSuppressed && context.isSuppressed(recipientEmail)) {
    return { matches: false, reason: 'RECIPIENT_SUPPRESSED' };
  }

  // 4. Dismissal check
  if (context.dismissals) {
    const dismissed = context.dismissals instanceof Set ? context.dismissals.has(job.id) : context.dismissals.includes(job.id);
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
  const subRemote = (sub.remote_preference || sub.remotePreference || '').toUpperCase();
  const jobRemote = (job.remote_eligibility || job.workplace_type || '').toUpperCase();
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
    // If the job is fully remote, it satisfies any location unless restricted
    if (!isJobRemote) {
      const jobLoc = (job.location || '').toLowerCase();
      const targetLoc = subLocation.toLowerCase();
      // Token-aware or substring matching for city/country
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
    const subCurrency = (sub.currency || 'USD').toUpperCase();
    const subPeriod = (sub.pay_period || sub.payPeriod || 'MONTHLY').toUpperCase();
    const subRequiredMonthly = toMonthlySalary(minRequired, subPeriod);

    // If job specifies salary
    if (job.salary && typeof job.salary === 'object') {
      const jobCurrency = (job.salary.currency || 'USD').toUpperCase();
      const jobPeriod = (job.salary.pay_period || job.salary.period || 'MONTHLY').toUpperCase();
      const jobMax = job.salary.max || job.salary.min || 0;
      const jobMaxMonthly = toMonthlySalary(jobMax, jobPeriod);

      if (jobCurrency === subCurrency && jobMaxMonthly < subRequiredMonthly) {
        return {
          matches: false,
          reason: 'SALARY_BELOW_MINIMUM',
          details: { requiredMonthly: subRequiredMonthly, actualMonthly: jobMaxMonthly },
        };
      }
    }
  }

  // 9. Query & Keyword Check (Token-boundary matching)
  const query = (sub.query || '').trim();
  if (query) {
    // Construct searchable text from job fields
    const searchableParts = [
      job.title || '',
      job.company || '',
      job.description || '',
      job.role_family || '',
      Array.isArray(job.skills) ? job.skills.join(' ') : '',
    ];
    const searchableText = searchableParts.join(' ').toLowerCase();

    // Split query into significant tokens (length >= 2)
    const tokens = query
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    if (tokens.length > 0) {
      const allTokensMatch = tokens.every((token) => {
        const re = new RegExp(`\\b${escapeRegex(token.toLowerCase())}\\b`, 'i');
        return re.test(searchableText);
      });

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
};
