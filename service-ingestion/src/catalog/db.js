// service-ingestion/src/catalog/db.js
const { MongoClient } = require('mongodb');
const { toCanonicalJob } = require('../models/job');

/**
 * Initializes required indexes on the MongoDB jobs collection.
 */
async function ensureMongoIndexes(jobsCollection) {
  if (!jobsCollection) return;

  try {
    // Backfill any legacy documents without id or canonical_url before creating unique indexes
    await backfillLegacyDocuments(jobsCollection);

    // 1. Unique index on public stable UUID
    await jobsCollection.createIndex({ id: 1 }, { unique: true, name: 'idx_jobs_id_unique' });

    // 2. Unique index on canonical_url
    await jobsCollection.createIndex({ canonical_url: 1 }, { unique: true, name: 'idx_jobs_canonical_url_unique' });

    // 3. Single field query indexes
    await jobsCollection.createIndex({ status: 1 }, { name: 'idx_jobs_status' });
    await jobsCollection.createIndex({ published_at: -1 }, { name: 'idx_jobs_published_at' });
    await jobsCollection.createIndex({ location: 1 }, { name: 'idx_jobs_location' });
    await jobsCollection.createIndex({ remote_eligibility: 1 }, { name: 'idx_jobs_remote_eligibility' });
    await jobsCollection.createIndex({ job_type: 1 }, { name: 'idx_jobs_job_type' });
    await jobsCollection.createIndex({ seniority: 1 }, { name: 'idx_jobs_seniority' });

    // 4. Keyset pagination compound indexes
    await jobsCollection.createIndex(
      { status: 1, published_at: -1, id: 1 },
      { name: 'idx_jobs_status_published_id' }
    );
    await jobsCollection.createIndex(
      { status: 1, 'salary.currency': 1, 'salary.min': -1, published_at: -1, id: 1 },
      { name: 'idx_jobs_status_salary_published_id' }
    );

    // 5. Text search index on title, company, skills, description
    await jobsCollection.createIndex(
      { title: 'text', company: 'text', skills: 'text', description: 'text' },
      {
        name: 'idx_jobs_text_search',
        weights: { title: 10, company: 5, skills: 3, description: 1 },
      }
    );

    console.log('✅ MongoDB indexes ensured successfully');
  } catch (err) {
    console.warn('⚠️ Warning ensuring MongoDB indexes:', err.message);
  }
}

/**
 * Safely backfills legacy documents (e.g. url -> canonical_url, raw_description -> description, id derivation).
 * Never deletes data.
 */
async function backfillLegacyDocuments(jobsCollection) {
  if (!jobsCollection) return { updated: 0 };

  let updatedCount = 0;
  try {
    const cursor = jobsCollection.find({
      $or: [{ id: { $exists: false } }, { canonical_url: { $exists: false } }, { description: { $exists: false } }],
    });

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      try {
        const canonical = toCanonicalJob(doc);
        await jobsCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              id: canonical.id,
              canonical_url: canonical.canonical_url,
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
 * Upserts a canonical job document into MongoDB by canonical_url.
 */
async function upsertJobDocument(jobsCollection, rawJob) {
  const canonical = toCanonicalJob(rawJob);

  const existing = typeof jobsCollection.findOne === 'function'
    ? await jobsCollection.findOne({ canonical_url: canonical.canonical_url })
    : null;
  const id = existing ? existing.id : canonical.id;

  const updateDoc = {
    $set: {
      id,
      canonical_url: canonical.canonical_url,
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
      last_seen_at: new Date(),
      ingested_at: canonical.ingested_at,
      expires_at: canonical.expires_at,
    },
    $setOnInsert: {
      first_seen_at: canonical.first_seen_at,
    },
  };

  await jobsCollection.updateOne(
    { canonical_url: canonical.canonical_url },
    updateDoc,
    { upsert: true }
  );

  return { ...canonical, id };
}

module.exports = {
  ensureMongoIndexes,
  backfillLegacyDocuments,
  upsertJobDocument,
};
