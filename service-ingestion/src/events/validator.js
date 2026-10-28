// service-ingestion/src/events/validator.js
/**
 * Authoritative Event Validator for Seekers Platform.
 * Loads and enforces canonical JSON Schemas from contracts/events/:
 * - envelope.schema.json
 * - job.collected.v1.schema.json
 *
 * Enforces strict typing, required fields, additionalProperties: false,
 * formats (uuid, date-time, uri), patterns, length bounds, normalized identity
 * consistency (SHA-256 hash match), and supported event matrix dispatch.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeCanonicalUrl } = require('../models/job');

// Regex standards
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SHA256_REGEX = /^[a-f0-9]{64}$/;

// Load authoritative schemas
const CONTRACTS_DIR = path.resolve(__dirname, '../../../contracts/events');
let ENVELOPE_SCHEMA = null;
let JOB_COLLECTED_SCHEMA = null;

try {
  const envelopePath = path.join(CONTRACTS_DIR, 'envelope.schema.json');
  if (fs.existsSync(envelopePath)) {
    ENVELOPE_SCHEMA = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
  }
  const jobCollectedPath = path.join(CONTRACTS_DIR, 'job.collected.v1.schema.json');
  if (fs.existsSync(jobCollectedPath)) {
    JOB_COLLECTED_SCHEMA = JSON.parse(fs.readFileSync(jobCollectedPath, 'utf8'));
  }
} catch (err) {
  console.warn('⚠️ Warning loading authoritative schemas from contracts/events:', err.message);
}

// Fallback embedded schemas if file system lookup fails in certain sandbox environments
if (!ENVELOPE_SCHEMA) {
  ENVELOPE_SCHEMA = {
    type: 'object',
    required: ['event_id', 'event_type', 'schema_version', 'producer', 'timestamp', 'correlation_id', 'payload'],
    properties: {
      event_id: { type: 'string', format: 'uuid' },
      event_type: { type: 'string', pattern: '^[a-z0-9]+(\\.[a-z0-9]+)+\\.v[1-9][0-9]*$' },
      schema_version: { type: 'string', pattern: '^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$' },
      producer: {
        type: 'string',
        enum: ['service-scraper', 'service-ingestion', 'service-user', 'service-resume', 'service-notification'],
      },
      timestamp: { type: 'string', format: 'date-time' },
      correlation_id: { type: 'string', format: 'uuid' },
      causation_id: { type: ['string', 'null'], format: 'uuid' },
      payload: { type: 'object' },
    },
    additionalProperties: false,
  };
}

if (!JOB_COLLECTED_SCHEMA) {
  JOB_COLLECTED_SCHEMA = {
    type: 'object',
    required: ['source', 'source_job_id', 'url', 'source_url_hash', 'title', 'company', 'location', 'description', 'collected_at'],
    properties: {
      source: { type: 'string', minLength: 2, maxLength: 64 },
      source_job_id: { type: 'string', minLength: 1, maxLength: 128 },
      url: { type: 'string', format: 'uri' },
      source_url_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      title: { type: 'string', minLength: 2, maxLength: 200 },
      company: { type: 'string', minLength: 1, maxLength: 150 },
      location: { type: 'string', minLength: 2, maxLength: 150 },
      description: { type: 'string', minLength: 10 },
      collected_at: { type: 'string', format: 'date-time' },
      raw_html: { type: 'string' },
    },
    additionalProperties: false,
  };
}

/**
 * Authoritative matrix of events and schema versions supported by service-ingestion.
 */
const SUPPORTED_EVENT_MATRIX = {
  'job.collected.v1': {
    supportedVersions: ['1.0.0'],
    payloadSchema: JOB_COLLECTED_SCHEMA,
  },
};

/**
 * Computes deterministic SHA-256 hash of a normalized URL string.
 */
function hashUrl(url) {
  const normalized = normalizeCanonicalUrl(url);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generic JSON Schema property validator (strict typing, formats, bounds).
 */
function validateValueAgainstProperty(val, prop, propName) {
  const errors = [];
  if (val === undefined) return errors;

  if (prop.type) {
    const allowedTypes = Array.isArray(prop.type) ? prop.type : [prop.type];
    const isNull = val === null;
    let actualType = isNull ? 'null' : Array.isArray(val) ? 'array' : typeof val;
    if (actualType === 'number' && Number.isInteger(val) && allowedTypes.includes('integer')) {
      actualType = 'integer';
    }

    if (!allowedTypes.includes(actualType)) {
      errors.push(`Field '${propName}' expected type ${allowedTypes.join('|')}, got ${actualType}`);
      return errors;
    }
  }

  if (typeof val === 'string') {
    if (prop.minLength !== undefined && val.length < prop.minLength) {
      errors.push(`Field '${propName}' length ${val.length} < minLength ${prop.minLength}`);
    }
    if (prop.maxLength !== undefined && val.length > prop.maxLength) {
      errors.push(`Field '${propName}' length ${val.length} > maxLength ${prop.maxLength}`);
    }
    if (prop.pattern) {
      const re = new RegExp(prop.pattern);
      if (!re.test(val)) {
        errors.push(`Field '${propName}' value '${val}' does not match pattern ${prop.pattern}`);
      }
    }
    if (prop.format === 'uuid' && !UUID_REGEX.test(val)) {
      errors.push(`Field '${propName}' must be a valid UUID format, got '${val}'`);
    }
    if (prop.format === 'date-time' && !ISO_DATE_REGEX.test(val)) {
      errors.push(`Field '${propName}' must be ISO-8601 UTC date-time string, got '${val}'`);
    }
    if (prop.format === 'uri') {
      try {
        const u = new URL(val);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          errors.push(`Field '${propName}' must have http or https scheme, got '${val}'`);
        }
      } catch (err) {
        errors.push(`Field '${propName}' must be a valid URI, got '${val}'`);
      }
    }
  }

  if (prop.enum && !prop.enum.includes(val)) {
    errors.push(`Field '${propName}' value '${val}' not in allowed enum [${prop.enum.join(', ')}]`);
  }

  return errors;
}

/**
 * Validates a JavaScript object against a JSON schema specification.
 */
function validateSchema(data, schema, contextName = 'Document') {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [`${contextName} must be a non-null object`];
  }

  // Required fields check
  if (Array.isArray(schema.required)) {
    for (const reqField of schema.required) {
      if (data[reqField] === undefined || data[reqField] === null) {
        errors.push(`Missing required field '${reqField}'`);
      }
    }
  }

  // Properties and additionalProperties check
  if (schema.properties) {
    for (const [key, val] of Object.entries(data)) {
      if (schema.properties[key]) {
        errors.push(...validateValueAgainstProperty(val, schema.properties[key], key));
      } else if (schema.additionalProperties === false) {
        errors.push(`Disallowed additional property '${key}'`);
      }
    }
  }

  return errors;
}

/**
 * Validates a SeekersEventEnvelope object against the authoritative envelope schema.
 */
function validateEnvelope(envelope) {
  const errors = validateSchema(envelope, ENVELOPE_SCHEMA, 'Envelope');
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates JobCollectedV1Payload against the authoritative payload schema,
 * plus checks identity consistency between url and source_url_hash.
 */
function validateJobCollectedPayload(payload) {
  const errors = validateSchema(payload, JOB_COLLECTED_SCHEMA, 'Payload');

  // Identity consistency check: source_url_hash must match normalized URL hash
  if (typeof payload.url === 'string' && typeof payload.source_url_hash === 'string') {
    const expectedHash = hashUrl(payload.url);
    if (payload.source_url_hash !== expectedHash) {
      errors.push(`Payload source_url_hash mismatch: expected '${expectedHash}', got '${payload.source_url_hash}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates incoming event message (buffer or string).
 * Handles both versioned SeekersEventEnvelope and legacy flat records.
 * Enforces supported event matrix and strict schema conformity.
 */
function validateIncomingEvent(rawMessage) {
  let parsed;
  if (typeof rawMessage === 'object' && rawMessage !== null && !Buffer.isBuffer(rawMessage)) {
    parsed = rawMessage;
  } else {
    try {
      const rawStr = Buffer.isBuffer(rawMessage) ? rawMessage.toString('utf8') : String(rawMessage);
      parsed = JSON.parse(rawStr);
    } catch (err) {
      return {
        valid: false,
        isPoison: true,
        errors: [`Invalid JSON: ${err.message}`],
        parsed: null,
        rawString: Buffer.isBuffer(rawMessage) ? rawMessage.toString('utf8') : String(rawMessage),
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      isPoison: true,
      errors: ['Event message must be a JSON object'],
      parsed,
    };
  }

  // 1. Versioned Envelope Path
  if ('event_type' in parsed || 'event_id' in parsed || 'schema_version' in parsed) {
    // Validate envelope structure against envelope.schema.json
    const envRes = validateEnvelope(parsed);
    if (!envRes.valid) {
      return {
        valid: false,
        isPoison: true,
        errors: envRes.errors,
        parsed,
      };
    }

    // Supported Event Matrix check
    const supportedConfig = SUPPORTED_EVENT_MATRIX[parsed.event_type];
    if (!supportedConfig) {
      return {
        valid: false,
        isPoison: true,
        errors: [`Unsupported event_type '${parsed.event_type}'. Supported events: ${Object.keys(SUPPORTED_EVENT_MATRIX).join(', ')}`],
        parsed,
      };
    }

    // Supported schema version check
    if (!supportedConfig.supportedVersions.includes(parsed.schema_version)) {
      return {
        valid: false,
        isPoison: true,
        errors: [
          `Unsupported schema_version '${parsed.schema_version}' for event '${parsed.event_type}'. Expected one of: ${supportedConfig.supportedVersions.join(', ')}`,
        ],
        parsed,
      };
    }

    // Payload validation against event-specific schema
    const payloadRes = validateJobCollectedPayload(parsed.payload);
    if (!payloadRes.valid) {
      return {
        valid: false,
        isPoison: true,
        errors: payloadRes.errors,
        parsed,
      };
    }

    return {
      valid: true,
      isPoison: false,
      isEnvelope: true,
      errors: [],
      envelope: parsed,
      payload: parsed.payload,
    };
  }

  // 2. Legacy Flat Format Transition Adapter (bounded and strictly typed)
  if (parsed.title !== undefined || parsed.company !== undefined || parsed.url !== undefined) {
    const legacyErrors = [];
    if (typeof parsed.title !== 'string' || parsed.title.trim().length < 2) {
      legacyErrors.push('Legacy job requires valid string title (min 2 chars)');
    }
    if (typeof parsed.company !== 'string' || parsed.company.trim().length < 1) {
      legacyErrors.push('Legacy job requires valid string company (min 1 char)');
    }
    const rawUrl = parsed.canonical_url || parsed.url;
    if (typeof rawUrl !== 'string' || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
      legacyErrors.push('Legacy job requires valid http/https url');
    }

    if (legacyErrors.length > 0) {
      return {
        valid: false,
        isPoison: true,
        errors: legacyErrors,
        parsed,
      };
    }

    return {
      valid: true,
      isPoison: false,
      isEnvelope: false,
      errors: [],
      payload: parsed,
    };
  }

  return {
    valid: false,
    isPoison: true,
    errors: ['Message does not conform to SeekersEventEnvelope or recognized legacy job format'],
    parsed,
  };
}

module.exports = {
  validateEnvelope,
  validateJobCollectedPayload,
  validateIncomingEvent,
  hashUrl,
  SUPPORTED_EVENT_MATRIX,
  ENVELOPE_SCHEMA,
  JOB_COLLECTED_SCHEMA,
};
