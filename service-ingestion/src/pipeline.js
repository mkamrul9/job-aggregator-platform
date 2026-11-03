// service-ingestion/src/pipeline.js
'use strict';

const {
  upsertJobDocument,
  quarantineDeadLetter,
} = require('./catalog/db');
const { indexJobToEs } = require('./search/elasticsearch');
const { validateIncomingEvent } = require('./events/validator');
const { toCanonicalJob } = require('./models/job');

/**
 * Processes incoming Kafka message or event buffer.
 * Performs schema validation, dead-letter quarantine for poison events,
 * atomic MongoDB persistence with revision tracking, and ES projection.
 */
async function processMessage(messageValue, { jobsCollection, deadLettersCollection = null, esClient } = {}) {
  if (!messageValue) return null;

  // 1. Validate envelope and payload
  const validation = validateIncomingEvent(messageValue);
  if (!validation.valid) {
    console.warn(`⚠️ Poison/Malformed event detected: ${validation.errors.join('; ')}`);
    if (!deadLettersCollection) {
      throw new Error(
        `Durable quarantine unavailable: deadLettersCollection is missing. Rejected event errors: ${validation.errors.join('; ')}`
      );
    }
    const deadLetter = await quarantineDeadLetter(
      deadLettersCollection,
      messageValue,
      validation.errors,
      validation.envelope || validation.parsed
    );
    return { quarantined: true, errors: validation.errors, dead_letter_id: deadLetter?.id };
  }

  let canonicalJob = null;

  // 2. Upsert into MongoDB canonical collection
  if (jobsCollection) {
    canonicalJob = await upsertJobDocument(jobsCollection, validation.payload, {
      eventTimestamp: validation.envelope?.timestamp,
      isEnvelope: Boolean(validation.isEnvelope),
    });
  } else {
    canonicalJob = toCanonicalJob(validation.payload);
  }

  // 3. Project to Elasticsearch if available
  if (esClient && canonicalJob) {
    try {
      await indexJobToEs(esClient, canonicalJob);
    } catch (esErr) {
      console.error(`⚠️ Elasticsearch indexing failed for "${canonicalJob.title}":`, esErr.message);
    }
  }

  return canonicalJob;
}

module.exports = {
  processMessage,
};
