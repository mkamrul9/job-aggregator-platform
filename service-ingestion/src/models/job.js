// service-ingestion/src/models/job.js
const crypto = require('crypto');

const RemoteEligibility = Object.freeze({
  FULLY_REMOTE: 'FULLY_REMOTE',
  HYBRID: 'HYBRID',
  ON_SITE: 'ON_SITE',
  UNSPECIFIED: 'UNSPECIFIED',
});

const JobType = Object.freeze({
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACT: 'CONTRACT',
  INTERNSHIP: 'INTERNSHIP',
  UNSPECIFIED: 'UNSPECIFIED',
});

const Seniority = Object.freeze({
  ENTRY: 'ENTRY',
  MID: 'MID',
  SENIOR: 'SENIOR',
  LEAD: 'LEAD',
  EXECUTIVE: 'EXECUTIVE',
  UNSPECIFIED: 'UNSPECIFIED',
});

const Currency = Object.freeze({
  BDT: 'BDT',
  USD: 'USD',
});

const PayPeriod = Object.freeze({
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
});

const JobStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  FLAGGED: 'FLAGGED',
});

const SortOption = Object.freeze({
  RELEVANCE: 'relevance',
  DATE_DESC: 'date_desc',
  SALARY_DESC: 'salary_desc',
});

/**
 * Normalizes a URL: removes tracking query parameters, normalizes path and host.
 */
function normalizeCanonicalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'msclkid',
      '_ga',
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Derives a stable, platform-wide UUID from a canonical URL.
 */
function generateDeterministicUuid(canonicalUrl) {
  const hash = crypto.createHash('sha256').update(canonicalUrl.trim()).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.substring(18, 20),
    hash.substring(20, 32),
  ].join('-');
}

/**
 * Validates outbound URL safety to prevent open redirects, private/loopback scanning, and script URLs.
 */
function validateOutboundUrl(urlStr, options = {}) {
  const { allowLocalhost = false } = options;
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, reason: 'URL is required and must be a string' };
  }

  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    if (parsed.username || parsed.password) {
      return { valid: false, reason: 'URL must not contain credentials' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname.includes('javascript') || hostname.includes('data')) {
      return { valid: false, reason: 'Deceptive or invalid hostname' };
    }

    const isLoopback = hostname === 'localhost' || /^127\./.test(hostname) || hostname === '::1' || hostname === '0.0.0.0';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/.test(hostname);

    if ((isLoopback || isPrivateIp) && !allowLocalhost) {
      return { valid: false, reason: 'Destination must not target private or loopback networks' };
    }

    return { valid: true, normalizedUrl: parsed.toString() };
  } catch (err) {
    return { valid: false, reason: 'Malformed URL: ' + err.message };
  }
}

/**
 * Strips script tags, HTML tags, and excessive whitespace from descriptions.
 */
function sanitizeDescription(desc) {
  if (!desc || typeof desc !== 'string') return '';
  return desc
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validates and converts an arbitrary input job record into a canonical job object.
 */
function toCanonicalJob(rawRecord) {
  let rawUrl = rawRecord.canonical_url || rawRecord.url || '';
  if (!rawUrl && rawRecord._id) {
    rawUrl = `https://seekers.internal/jobs/legacy/${rawRecord._id}`;
  }
  const canonical_url = normalizeCanonicalUrl(rawUrl);
  if (!canonical_url) {
    throw new Error('canonical_url or url is required');
  }

  const id = rawRecord.id || generateDeterministicUuid(canonical_url);
  const title = (rawRecord.title || '').trim();
  const company = (rawRecord.company || '').trim();
  const description = sanitizeDescription(rawRecord.description || rawRecord.raw_description || '');

  let remote_eligibility = RemoteEligibility.UNSPECIFIED;
  if (rawRecord.remote_eligibility && RemoteEligibility[rawRecord.remote_eligibility]) {
    remote_eligibility = rawRecord.remote_eligibility;
  }

  let job_type = JobType.UNSPECIFIED;
  if (rawRecord.job_type && JobType[rawRecord.job_type]) {
    job_type = rawRecord.job_type;
  }

  let seniority = Seniority.UNSPECIFIED;
  if (rawRecord.seniority && Seniority[rawRecord.seniority]) {
    seniority = rawRecord.seniority;
  }

  let status = JobStatus.ACTIVE;
  if (rawRecord.status && JobStatus[rawRecord.status]) {
    status = rawRecord.status;
  }

  let salary = null;
  if (rawRecord.salary && typeof rawRecord.salary === 'object') {
    const s = rawRecord.salary;
    const currency = s.currency === 'USD' ? Currency.USD : s.currency === 'BDT' ? Currency.BDT : null;
    const period = s.period === 'YEARLY' ? PayPeriod.YEARLY : s.period === 'MONTHLY' ? PayPeriod.MONTHLY : null;
    const min = typeof s.min === 'number' && Number.isFinite(s.min) && s.min >= 0 ? s.min : null;
    const max = typeof s.max === 'number' && Number.isFinite(s.max) && s.max >= (min || 0) ? s.max : null;

    if (currency && period) {
      salary = { currency, period, min, max };
    }
  }

  const skills = Array.isArray(rawRecord.skills)
    ? Array.from(new Set(rawRecord.skills.map((s) => String(s).trim()).filter(Boolean)))
    : [];

  const now = new Date();
  const published_at = rawRecord.published_at ? new Date(rawRecord.published_at) : (rawRecord.scraped_at ? new Date(rawRecord.scraped_at) : now);
  const ingested_at = rawRecord.ingested_at ? new Date(rawRecord.ingested_at) : now;
  const first_seen_at = rawRecord.first_seen_at ? new Date(rawRecord.first_seen_at) : ingested_at;
  const last_seen_at = rawRecord.last_seen_at ? new Date(rawRecord.last_seen_at) : now;
  const expires_at = rawRecord.expires_at ? new Date(rawRecord.expires_at) : null;

  return {
    id,
    canonical_url,
    source: (rawRecord.source || 'aggregator').trim(),
    source_id: rawRecord.source_id ? String(rawRecord.source_id).trim() : null,
    title,
    company,
    location: (rawRecord.location || 'Unspecified').trim(),
    remote_eligibility,
    job_type,
    seniority,
    salary,
    skills,
    description,
    status,
    published_at,
    first_seen_at,
    last_seen_at,
    ingested_at,
    expires_at,
  };
}

/**
 * Formats a canonical job to the public OpenAPI JobSummary schema.
 */
function toJobSummary(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    remote_eligibility: job.remote_eligibility,
    job_type: job.job_type,
    seniority: job.seniority,
    salary: job.salary || undefined,
    skills: job.skills,
    source: job.source,
    published_at: job.published_at instanceof Date ? job.published_at.toISOString() : new Date(job.published_at).toISOString(),
  };
}

/**
 * Formats a canonical job to the public OpenAPI JobDetail schema.
 */
function toJobDetail(job) {
  const summary = toJobSummary(job);
  return {
    ...summary,
    description: job.description,
    canonical_url: job.canonical_url,
    status: job.status,
    ingested_at: job.ingested_at instanceof Date ? job.ingested_at.toISOString() : new Date(job.ingested_at).toISOString(),
  };
}

module.exports = {
  RemoteEligibility,
  JobType,
  Seniority,
  Currency,
  PayPeriod,
  JobStatus,
  SortOption,
  normalizeCanonicalUrl,
  generateDeterministicUuid,
  validateOutboundUrl,
  sanitizeDescription,
  toCanonicalJob,
  toJobSummary,
  toJobDetail,
};
