// service-ingestion/src/catalog/db.js
const crypto = require('crypto');
const { toCanonicalJob } = require('../models/job');

/**
 * Computes deterministic SHA-256 hash of a normalized URL string.
 */
function hashUrl(url) {
  return crypto.createHash('sha256').update(String(url).trim()).digest('hex');
}

/**
 * Initializes required indexes on the MongoDB jobs and dead_letters collections.
 */
async function ensureMongoIndexes(jobsCollection, deadLettersCollection = null) {
  if (!jobsCollection) return;

  try {
    // Backfill any legacy documents without id or canonical_url before creating unique indexes
    await backfillLegacyDocuments(jobsCollection);

    // 1. Unique index on public stable UUID
    await jobsCollection.createIndex({ id: 1 }, { unique: true, name: 'idx_jobs_id_unique' });

    // 2. Unique index on canonical_url
    await jobsCollection.createIndex({ canonical_url: 1 }, { unique: true, name: 'idx_jobs_canonical_url_unique' });

    // 3. Unique index on source_url_hash (sparse to support legacy items during transition)
    await jobsCollection.createIndex(
      { source_url_hash: 1 },
      { unique: true, sparse: true, name: 'idx_jobs_source_url_hash_unique' }
    );

    // 4. Projection outbox status index
    await jobsCollection.createIndex({ projection_status: 1 }, { name: 'idx_jobs_projection_status' });

    // 5. Lifecycle and filtering indexes
    await jobsCollection.createIndex({ status: 1 }, { name: 'idx_jobs_status' });
    await jobsCollection.createIndex({ published_at: -1 }, { name: 'idx_jobs_published_at' });
    await jobsCollection.createIndex({ location: 1 }, { name: 'idx_jobs_location' });
    await jobsCollection.createIndex({ remote_eligibility: 1 }, { name: 'idx_jobs_remote_eligibility' });
    await jobsCollection.createIndex({ job_type: 1 }, { name: 'idx_jobs_job_type' });
    await jobsCollection.createIndex({ seniority: 1 }, { name: 'idx_jobs_seniority' });

    // 6. Keyset pagination compound indexes
    await jobsCollection.createIndex(
      { status: 1, published_at: -1, id: 1 },
      { name: 'idx_jobs_status_published_id' }
    );
    await jobsCollection.createIndex(
      { status: 1, 'salary.currency': 1, 'salary.min': -1, published_at: -1, id: 1 },
      { name: 'idx_jobs_status_salary_published_id' }
    );

    // 7. Text search index on title, company, skills, description
    await jobsCollection.createIndex(
      { title: 'text', company: 'text', skills: 'text', description: 'text' },
      {
        name: 'idx_jobs_text_search',
        weights: { title: 10, company: 5, skills: 3, description: 1 },
      }
    );

    // 8. Dead letters collection indexes
    if (deadLettersCollection) {
      await deadLettersCollection.createIndex({ id: 1 }, { unique: true, name: 'idx_dead_letters_id_unique' });
      await deadLettersCollection.createIndex({ status: 1, quarantined_at: -1 }, { name: 'idx_dead_letters_status_date' });
    }

    console.log('✅ MongoDB indexes ensured successfully');
  } catch (err) {
    console.warn('⚠️ Warning ensuring MongoDB indexes:', err.message);
  }
}

/**
 * Safely backfills legacy documents (e.g. url -> canonical_url, raw_description -> description, id derivation).
 */
async function backfillLegacyDocuments(jobsCollection) {
  if (!jobsCollection) return { updated: 0 };

  let updatedCount = 0;
  try {
    const cursor = jobsCollection.find({
      $or: [
        { id: { $exists: false } },
        { canonical_url: { $exists: false } },
        { description: { $exists: false } },
        { source_url_hash: { $exists: false } },
        { revision: { $exists: false } },
        { projection_status: { $exists: false } },
      ],
    });

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      try {
        const canonical = toCanonicalJob(doc);
        const sourceUrlHash = doc.source_url_hash || hashUrl(canonical.canonical_url);
        await jobsCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              id: doc.id || canonical.id,
              canonical_url: canonical.canonical_url,
              source_url_hash: sourceUrlHash,
              title: canonical.title,
              company: canonical.company,
              location: canonical.location,
              remote_eligibility: canonical.remote_eligibility,
              job_type: canonical.job_type,
              seniority: canonical.seniority,
              salary: canonical.salary,
              skills: canonical.skills,
              description: canonical.description,
              status: canonical.status,
              published_at: canonical.published_at,
              ingested_at: canonical.ingested_at,
              revision: doc.revision || 1,
              projection_status: doc.projection_status || 'INDEXED',
              projection_version: doc.projection_version || 1,
            },
          }
        );
        updatedCount += 1;
      } catch (docErr) {
        console.warn(`Skipping legacy doc ${doc._id}:`, docErr.message);
      }
    }

    if (updatedCount > 0) {
      console.log(`✅ Backfilled ${updatedCount} legacy job documents to canonical schema`);
    }
  } catch (err) {
    console.warn('⚠️ Warning during legacy backfill:', err.message);
  }

  return { updated: updatedCount };
}

/**
 * Detects whether content has meaningfully changed between existing document and new data.
 */
function hasContentChanged(existing, canonical) {
  if (!existing) return true;
  if (existing.title !== canonical.title) return true;
  if (existing.company !== canonical.company) return true;
  if (existing.location !== canonical.location) return true;
  if (existing.description !== canonical.description) return true;
  if (existing.status !== canonical.status) return true;
  if (existing.remote_eligibility && existing.remote_eligibility !== canonical.remote_eligibility) return true;
  if (existing.job_type && existing.job_type !== canonical.job_type) return true;
  if (existing.seniority && existing.seniority !== canonical.seniority) return true;
  return false;
}

/**
 * Upserts a canonical job document into MongoDB with atomic revision tracking,
 * idempotency, first_seen_at preservation, and cross-source sighting management.
 */
async function upsertJobDocument(jobsCollection, rawJob, options = {}) {
  const canonical = toCanonicalJob(rawJob);
  const sourceUrlHash = rawJob.source_url_hash || hashUrl(canonical.canonical_url);
  const now = new Date();

  // Find existing document by canonical_url or source_url_hash
  const existing = typeof jobsCollection.findOne === 'function'
    ? await jobsCollection.findOne({
        $or: [{ canonical_url: canonical.canonical_url }, { source_url_hash: sourceUrlHash }],
      })
    : null;

  if (existing) {
    const id = existing.id;
    const isChanged = hasContentChanged(existing, canonical);
    const revision = isChanged ? (existing.revision || 1) + 1 : existing.revision || 1;
    const projectionStatus = isChanged ? 'PENDING' : existing.projection_status || 'INDEXED';

    // Manage sightings
    const sightings = Array.isArray(existing.sightings) ? [...existing.sightings] : [];
    const existingSightingIdx = sightings.findIndex((s) => s.source === canonical.source && s.source_job_id === canonical.source_id);
    if (existingSightingIdx >= 0) {
      sightings[existingSightingIdx].seen_at = now;
    } else {
      sightings.push({
        source: canonical.source,
        source_job_id: canonical.source_id,
        url: canonical.canonical_url,
        seen_at: now,
      });
    }

    const updateDoc = {
      $set: {
        id,
        canonical_url: canonical.canonical_url,
        source_url_hash: sourceUrlHash,
        source: canonical.source,
        source_id: canonical.source_id,
        title: canonical.title,
        company: canonical.company,
        location: canonical.location,
        remote_eligibility: canonical.remote_eligibility,
        job_type: canonical.job_type,
        seniority: canonical.seniority,
        salary: canonical.salary,
        skills: canonical.skills,
        description: canonical.description,
        status: canonical.status,
        published_at: canonical.published_at,
        last_seen_at: now,
        ingested_at: isChanged ? now : existing.ingested_at || now,
        expires_at: canonical.expires_at,
        revision,
        projection_status: projectionStatus,
        sightings,
      },
    };

    if (typeof jobsCollection.updateOne === 'function') {
      await jobsCollection.updateOne({ _id: existing._id }, updateDoc);
    }

    return {
      ...canonical,
      id,
      source_url_hash: sourceUrlHash,
      revision,
      projection_status: projectionStatus,
      first_seen_at: existing.first_seen_at || now,
      last_seen_at: now,
      is_new: false,
      is_updated: isChanged,
    };
  }

  // New document
  const id = canonical.id;
  const initialFirstSeen = canonical.first_seen_at || now;
  const setDoc = {
    id,
    canonical_url: canonical.canonical_url,
    source_url_hash: sourceUrlHash,
    source: canonical.source,
    source_id: canonical.source_id,
    title: canonical.title,
    company: canonical.company,
    location: canonical.location,
    remote_eligibility: canonical.remote_eligibility,
    job_type: canonical.job_type,
    seniority: canonical.seniority,
    salary: canonical.salary,
    skills: canonical.skills,
    description: canonical.description,
    status: canonical.status,
    published_at: canonical.published_at,
    last_seen_at: now,
    ingested_at: canonical.ingested_at || now,
    expires_at: canonical.expires_at,
    revision: 1,
    projection_status: 'PENDING',
    projection_version: 0,
    sightings: [
      {
        source: canonical.source,
        source_job_id: canonical.source_id,
        url: canonical.canonical_url,
        seen_at: now,
      },
    ],
    is_synthetic: Boolean(rawJob.is_synthetic),
  };

  if (typeof jobsCollection.updateOne === 'function') {
    await jobsCollection.updateOne(
      { canonical_url: canonical.canonical_url },
      { $set: setDoc, $setOnInsert: { first_seen_at: initialFirstSeen } },
      { upsert: true }
    );
  }

  return {
    ...canonical,
    ...setDoc,
    source_url_hash: sourceUrlHash,
    first_seen_at: initialFirstSeen,
    is_new: true,
    is_updated: true,
  };
}

/**
 * Quarantines a malformed or poison event to the dead_letters collection.
 */
async function quarantineDeadLetter(deadLettersCollection, rawData, errors, envelope = null) {
  if (!deadLettersCollection) return null;

  const id = crypto.randomUUID();
  const deadLetter = {
    id,
    event_id: envelope?.event_id || null,
    event_type: envelope?.event_type || 'unknown',
    producer: envelope?.producer || null,
    correlation_id: envelope?.correlation_id || null,
    raw_payload:
      typeof rawData === 'string'
        ? rawData
        : Buffer.isBuffer(rawData)
        ? rawData.toString('utf8')
        : JSON.stringify(rawData),
    errors: Array.isArray(errors) ? errors : [String(errors)],
    quarantined_at: new Date(),
    retry_count: 0,
    status: 'QUARANTINED',
  };

  await deadLettersCollection.insertOne(deadLetter);
  return deadLetter;
}

/**
 * Retrieves quarantined dead letters for operator inspection.
 */
async function getDeadLetters(deadLettersCollection, { limit = 50, status = 'QUARANTINED' } = {}) {
  if (!deadLettersCollection) return [];
  const query = status ? { status } : {};
  return await deadLettersCollection.find(query).sort({ quarantined_at: -1 }).limit(limit).toArray();
}

module.exports = {
  hashUrl,
  ensureMongoIndexes,
  backfillLegacyDocuments,
  upsertJobDocument,
  quarantineDeadLetter,
  getDeadLetters,
};
