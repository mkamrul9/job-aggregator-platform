// service-ingestion/src/catalog/db.js
const crypto = require('crypto');
const { toCanonicalJob, normalizeCanonicalUrl } = require('../models/job');

/**
 * Computes deterministic SHA-256 hash of a normalized URL string.
 */
function hashUrl(url) {
  const normalized = normalizeCanonicalUrl(url);
  return crypto.createHash('sha256').update(String(normalized).trim()).digest('hex');
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
 * Comprehensively checks all fields affecting API, search, lifecycle, and moderation:
 * title, company, location, description, status, remote_eligibility, job_type, seniority,
 * salary, skills, expires_at, and is_synthetic provenance.
 */
function hasContentChanged(existing, canonical) {
  if (!existing) return true;
  if (existing.title !== canonical.title) return true;
  if (existing.company !== canonical.company) return true;
  if (existing.location !== canonical.location) return true;
  if (existing.description !== canonical.description) return true;
  if (existing.status !== canonical.status) return true;
  const remote1 = existing.remote_eligibility || 'UNSPECIFIED';
  const remote2 = canonical.remote_eligibility || 'UNSPECIFIED';
  if (remote1 !== remote2) return true;

  const jobType1 = existing.job_type || 'UNSPECIFIED';
  const jobType2 = canonical.job_type || 'UNSPECIFIED';
  if (jobType1 !== jobType2) return true;

  const seniority1 = existing.seniority || 'UNSPECIFIED';
  const seniority2 = canonical.seniority || 'UNSPECIFIED';
  if (seniority1 !== seniority2) return true;
  if (Boolean(existing.is_synthetic) !== Boolean(canonical.is_synthetic)) return true;

  // Salary comparison (currency, period, min, max, normalized monthly values)
  const s1 = existing.salary;
  const s2 = canonical.salary;
  if (Boolean(s1) !== Boolean(s2)) return true;
  if (s1 && s2) {
    if (s1.currency !== s2.currency) return true;
    if (s1.period !== s2.period) return true;
    if (s1.min !== s2.min) return true;
    if (s1.max !== s2.max) return true;
    if (s1.normalized_monthly_min !== s2.normalized_monthly_min) return true;
    if (s1.normalized_monthly_max !== s2.normalized_monthly_max) return true;
  }

  // Skills comparison (sorted array equality)
  const skills1 = Array.isArray(existing.skills) ? [...existing.skills].sort() : [];
  const skills2 = Array.isArray(canonical.skills) ? [...canonical.skills].sort() : [];
  if (skills1.length !== skills2.length) return true;
  for (let i = 0; i < skills1.length; i++) {
    if (skills1[i] !== skills2[i]) return true;
  }

  // Expiration date comparison
  const exp1 = existing.expires_at ? new Date(existing.expires_at).getTime() : null;
  const exp2 = canonical.expires_at ? new Date(canonical.expires_at).getTime() : null;
  if (exp1 !== exp2) return true;

  // Canonical URL comparison
  if (existing.canonical_url !== canonical.canonical_url) return true;

  return false;
}

/**
 * Upserts a canonical job document into MongoDB with atomic revision tracking,
 * idempotency, first_seen_at preservation, stale event rejection, moderation
 * protection, and cross-source sighting management.
 */
async function upsertJobDocument(jobsCollection, rawJob, options = {}) {
  const canonical = toCanonicalJob(rawJob);
  const verifiedHash = hashUrl(canonical.canonical_url);
  const now = new Date();
  const eventTimestamp = options.eventTimestamp ? new Date(options.eventTimestamp) : null;
  const isEnvelope = Boolean(options.isEnvelope);

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Find existing document by canonical_url or verified source_url_hash
    const existing = typeof jobsCollection.findOne === 'function'
      ? await jobsCollection.findOne({
          $or: [{ canonical_url: canonical.canonical_url }, { source_url_hash: verifiedHash }],
        })
      : null;

    if (existing) {
      const id = existing.id;

      // 1. Stale event check: do not let older crawler events overwrite newer canonical content
      let isStale = false;
      if (eventTimestamp && existing.last_event_timestamp) {
        if (eventTimestamp.getTime() < new Date(existing.last_event_timestamp).getTime()) {
          isStale = true;
        }
      }

      // 2. Dual-publish protection: if flat jobs.new arrives for an already structured record,
      // preserve structured skills, salary, and remote_eligibility rather than blanking them.
      let effectiveCanonical = { ...canonical };
      if (!isEnvelope && !rawJob.skills && Array.isArray(existing.skills) && existing.skills.length > 0) {
        effectiveCanonical.skills = existing.skills;
      }
      if (!isEnvelope && !rawJob.salary && existing.salary) {
        effectiveCanonical.salary = existing.salary;
      }
      if (!isEnvelope && (!rawJob.remote_eligibility || rawJob.remote_eligibility === 'UNSPECIFIED') && existing.remote_eligibility) {
        effectiveCanonical.remote_eligibility = existing.remote_eligibility;
      }

      // 3. Moderation Invariant: Never allow an automated crawler event to reactivate an EXPIRED or FLAGGED listing
      if (existing.status === 'EXPIRED' || existing.status === 'FLAGGED') {
        effectiveCanonical.status = existing.status;
      }

      // 4. Content change detection
      const isChanged = !isStale && hasContentChanged(existing, effectiveCanonical);
      const revision = isChanged ? (existing.revision || 1) + 1 : existing.revision || 1;
      const projectionStatus = isChanged ? 'PENDING' : existing.projection_status || 'INDEXED';

      // 5. Preserved publication timestamp during replay/update
      const published_at = rawJob.published_at
        ? new Date(rawJob.published_at)
        : existing.published_at || effectiveCanonical.published_at;

      // 6. Manage sightings
      const sightings = Array.isArray(existing.sightings) ? [...existing.sightings] : [];
      const sightingSourceId = effectiveCanonical.source_id || rawJob.source_job_id;
      const existingSightingIdx = sightings.findIndex(
        (s) => s.source === effectiveCanonical.source && s.source_job_id === sightingSourceId
      );
      if (existingSightingIdx >= 0) {
        sightings[existingSightingIdx].seen_at = now;
      } else {
        sightings.push({
          source: effectiveCanonical.source,
          source_job_id: sightingSourceId,
          url: effectiveCanonical.canonical_url,
          seen_at: now,
        });
      }

      const updateDoc = {
        $set: {
          id,
          canonical_url: effectiveCanonical.canonical_url,
          source_url_hash: verifiedHash,
          source: isStale ? existing.source : effectiveCanonical.source,
          source_id: isStale ? existing.source_id : effectiveCanonical.source_id,
          title: isStale ? existing.title : effectiveCanonical.title,
          company: isStale ? existing.company : effectiveCanonical.company,
          location: isStale ? existing.location : effectiveCanonical.location,
          remote_eligibility: isStale ? existing.remote_eligibility : effectiveCanonical.remote_eligibility,
          job_type: isStale ? existing.job_type : effectiveCanonical.job_type,
          seniority: isStale ? existing.seniority : effectiveCanonical.seniority,
          salary: isStale ? existing.salary : effectiveCanonical.salary,
          skills: isStale ? existing.skills : effectiveCanonical.skills,
          description: isStale ? existing.description : effectiveCanonical.description,
          status: effectiveCanonical.status,
          published_at,
          last_seen_at: now,
          ingested_at: isChanged ? now : existing.ingested_at || now,
          expires_at: isStale ? existing.expires_at : effectiveCanonical.expires_at,
          revision,
          projection_status: projectionStatus,
          sightings,
          ...(eventTimestamp ? { last_event_timestamp: eventTimestamp } : {}),
        },
      };

      if (typeof jobsCollection.findOneAndUpdate === 'function') {
        // Atomic CAS update predicated on existing revision to prevent concurrent overwrite
        const updateRes = await jobsCollection.findOneAndUpdate(
          { _id: existing._id, revision: existing.revision },
          updateDoc,
          { returnDocument: 'after' }
        );

        if (updateRes && (updateRes.value || updateRes._id)) {
          const doc = updateRes.value || updateRes;
          return {
            ...effectiveCanonical,
            ...updateDoc.$set,
            ...doc,
            id,
            source_url_hash: verifiedHash,
            revision,
            projection_status: projectionStatus,
            first_seen_at: existing.first_seen_at || now,
            last_seen_at: now,
            is_new: false,
            is_updated: isChanged,
          };
        }
        // Revision conflict under contention; retry CAS loop
        continue;
      } else if (typeof jobsCollection.updateOne === 'function') {
        await jobsCollection.updateOne({ _id: existing._id }, updateDoc);
        return {
          ...effectiveCanonical,
          ...updateDoc.$set,
          id,
          source_url_hash: verifiedHash,
          revision,
          projection_status: projectionStatus,
          first_seen_at: existing.first_seen_at || now,
          last_seen_at: now,
          is_new: false,
          is_updated: isChanged,
        };
      }
    }

    // New document
    const id = canonical.id;
    const initialFirstSeen = canonical.first_seen_at || now;
    const setDoc = {
      id,
      canonical_url: canonical.canonical_url,
      source_url_hash: verifiedHash,
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
      ...(eventTimestamp ? { last_event_timestamp: eventTimestamp } : {}),
    };

    if (typeof jobsCollection.updateOne === 'function') {
      try {
        await jobsCollection.updateOne(
          { canonical_url: canonical.canonical_url },
          { $set: setDoc, $setOnInsert: { first_seen_at: initialFirstSeen } },
          { upsert: true }
        );
      } catch (insertErr) {
        if (insertErr.code === 11000) {
          // Concurrent insert race; retry CAS loop as update
          continue;
        }
        throw insertErr;
      }
    }

    return {
      ...canonical,
      ...setDoc,
      source_url_hash: verifiedHash,
      first_seen_at: initialFirstSeen,
      is_new: true,
      is_updated: true,
    };
  }

  throw new Error(`Failed to atomically upsert job ${canonical.canonical_url} after ${maxAttempts} attempts`);
}

/**
 * Quarantines a malformed or poison event to the dead_letters collection.
 */
async function quarantineDeadLetter(deadLettersCollection, rawData, errors, envelope = null) {
  if (!deadLettersCollection) {
    throw new Error('Durable quarantine failed: deadLettersCollection is null or undefined');
  }

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
  hasContentChanged,
  quarantineDeadLetter,
  getDeadLetters,
};
