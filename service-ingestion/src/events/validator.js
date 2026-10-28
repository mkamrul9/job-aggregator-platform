// service-ingestion/src/events/validator.js
/**
 * Event validator for SeekersEventEnvelope and JobCollectedV1Payload.
 * Validates structural integrity, required fields, formats, and value constraints.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SHA256_REGEX = /^[a-f0-9]{64}$/;
const URI_REGEX = /^https?:\/\/[^\s$.?#].[^\s]*$/i;

/**
 * Validates a SeekersEventEnvelope object against contracts/events/envelope.schema.json
 */
function validateEnvelope(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { valid: false, errors: ['Envelope must be a non-null object'] };
  }

  // Required fields
  const required = ['event_id', 'event_type', 'schema_version', 'producer', 'timestamp', 'correlation_id', 'payload'];
  for (const field of required) {
    if (envelope[field] === undefined || envelope[field] === null) {
      errors.push(`Missing required envelope field '${field}'`);
    }
  }

  if (envelope.event_id && !UUID_REGEX.test(envelope.event_id)) {
    errors.push(`Field 'event_id' must be a valid UUIDv4/v7 format, got '${envelope.event_id}'`);
  }

  if (envelope.event_type && typeof envelope.event_type === 'string') {
    if (!/^[a-z0-9]+(\.[a-z0-9]+)+\.v[1-9][0-9]*$/.test(envelope.event_type)) {
      errors.push(`Field 'event_type' invalid format: '${envelope.event_type}'`);
    }
  }

  if (envelope.schema_version && typeof envelope.schema_version === 'string') {
    if (!/^[1-9][0-9]*\.[0-9]+\.[0-9]+$/.test(envelope.schema_version)) {
      errors.push(`Field 'schema_version' must be semantic version string, got '${envelope.schema_version}'`);
    }
  }

  if (envelope.producer && typeof envelope.producer === 'string') {
    const validProducers = ['service-scraper', 'service-ingestion', 'service-user', 'service-resume', 'service-notification'];
    if (!validProducers.includes(envelope.producer)) {
      errors.push(`Field 'producer' must be recognized platform service, got '${envelope.producer}'`);
    }
  }

  if (envelope.timestamp && !ISO_DATE_REGEX.test(envelope.timestamp)) {
    errors.push(`Field 'timestamp' must be ISO-8601 UTC date-time string, got '${envelope.timestamp}'`);
  }

  if (envelope.correlation_id && !UUID_REGEX.test(envelope.correlation_id)) {
    errors.push(`Field 'correlation_id' must be a valid UUID format, got '${envelope.correlation_id}'`);
  }

  if (envelope.causation_id && !UUID_REGEX.test(envelope.causation_id)) {
    errors.push(`Field 'causation_id' must be a valid UUID format or null, got '${envelope.causation_id}'`);
  }

  if (envelope.payload && (typeof envelope.payload !== 'object' || Array.isArray(envelope.payload))) {
    errors.push(`Field 'payload' must be a non-null object`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates JobCollectedV1Payload against contracts/events/job.collected.v1.schema.json
 */
function validateJobCollectedPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  const required = ['source', 'source_job_id', 'url', 'source_url_hash', 'title', 'company', 'location', 'description', 'collected_at'];
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) {
      errors.push(`Missing required payload field '${field}'`);
    }
  }

  if (typeof payload.source === 'string') {
    if (payload.source.length < 2 || payload.source.length > 64) {
      errors.push(`Payload 'source' length must be between 2 and 64 chars`);
    }
  }

  if (typeof payload.source_job_id === 'string') {
    if (payload.source_job_id.length < 1 || payload.source_job_id.length > 128) {
      errors.push(`Payload 'source_job_id' length must be between 1 and 128 chars`);
    }
  }

  if (typeof payload.url === 'string') {
    if (!URI_REGEX.test(payload.url)) {
      errors.push(`Payload 'url' must be valid HTTP/HTTPS URI, got '${payload.url}'`);
    }
  }

  if (typeof payload.source_url_hash === 'string') {
    if (!SHA256_REGEX.test(payload.source_url_hash)) {
      errors.push(`Payload 'source_url_hash' must be 64-hex SHA-256 string, got '${payload.source_url_hash}'`);
    }
  }

  if (typeof payload.title === 'string') {
    if (payload.title.length < 2 || payload.title.length > 200) {
      errors.push(`Payload 'title' length must be between 2 and 200 chars`);
    }
  }

  if (typeof payload.company === 'string') {
    if (payload.company.length < 1 || payload.company.length > 150) {
      errors.push(`Payload 'company' length must be between 1 and 150 chars`);
    }
  }

  if (typeof payload.location === 'string') {
    if (payload.location.length < 2 || payload.location.length > 150) {
      errors.push(`Payload 'location' length must be between 2 and 150 chars`);
    }
  }

  if (typeof payload.description === 'string') {
    if (payload.description.length < 10) {
      errors.push(`Payload 'description' must have minimum length of 10 chars`);
    }
  }

  if (typeof payload.collected_at === 'string') {
    if (!ISO_DATE_REGEX.test(payload.collected_at)) {
      errors.push(`Payload 'collected_at' must be ISO-8601 UTC date-time string, got '${payload.collected_at}'`);
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
 */
function validateIncomingEvent(rawMessage) {
  let parsed;
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

  // Check if versioned envelope
  if (parsed && parsed.event_type) {
    const envRes = validateEnvelope(parsed);
    if (!envRes.valid) {
      return {
        valid: false,
        isPoison: true,
        errors: envRes.errors,
        parsed,
      };
    }

    if (parsed.event_type === 'job.collected.v1') {
      const payloadRes = validateJobCollectedPayload(parsed.payload);
      if (!payloadRes.valid) {
        return {
          valid: false,
          isPoison: true,
          errors: payloadRes.errors,
          parsed,
        };
      }
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

  // Legacy flat format fallback (title, company, url)
  if (parsed && parsed.title && parsed.company && parsed.url) {
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
};
