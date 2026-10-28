// service-ingestion/src/api/jobs-router.js
const express = require('express');
const crypto = require('crypto');
const {
  validateOutboundUrl,
  toJobDetail,
  isListingAvailable,
} = require('../models/job');
const {
  createProblemDetails,
  validateSearchParams,
} = require('../search/query-validator');
const { searchJobsEs } = require('../search/elasticsearch');
const { searchJobsMongo } = require('../search/mongo-search');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createJobsRouter({ jobsCollection, esClient }) {
  const router = express.Router();

  // Middleware to ensure X-Correlation-ID is set
  router.use((req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  });

  // 1. GET / and /api/jobs and /api/v1/jobs - Search and list jobs
  router.get('/', async (req, res) => {
    const validation = validateSearchParams(req.query, req.originalUrl);
    if (!validation.valid) {
      return res.status(validation.error.status).type('application/problem+json').json(validation.error);
    }

    try {
      let result = null;
      let usedEngine = 'mongodb';

      if (esClient) {
        try {
          result = await searchJobsEs(esClient, validation.params);
          usedEngine = 'elasticsearch';
        } catch (esErr) {
          console.warn('⚠️ Elasticsearch search failed, falling back to MongoDB:', esErr.message);
        }
      }

      if (!result) {
        if (!jobsCollection) {
          return res.status(503).type('application/problem+json').json(
            createProblemDetails({
              type: 'https://errors.seekers.internal/service-unavailable',
              title: 'Service Unavailable',
              status: 503,
              detail: 'Database collection not available',
              instance: req.originalUrl,
            })
          );
        }
        result = await searchJobsMongo(jobsCollection, validation.params);
        usedEngine = 'mongodb';
      }

      res.setHeader('X-Search-Engine', usedEngine);
      return res.status(200).json(result);
    } catch (err) {
      console.error('Error in searchJobs:', err);
      return res.status(500).type('application/problem+json').json(
        createProblemDetails({
          type: 'https://errors.seekers.internal/internal-server-error',
          title: 'Internal Search Error',
          status: 500,
          detail: 'Failed to execute job search: ' + err.message,
          instance: req.originalUrl,
        })
      );
    }
  });

  // 2. GET /:id/outbound - Safe outbound destination redirect & tracking
  router.get('/:id/outbound', async (req, res) => {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(404).type('application/problem+json').json(
        createProblemDetails({
          type: 'https://errors.seekers.internal/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Job listing not found',
          instance: req.originalUrl,
        })
      );
    }

    if (!jobsCollection) {
      return res.status(503).type('application/problem+json').json(
        createProblemDetails({
          type: 'https://errors.seekers.internal/service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Catalog storage is currently unavailable',
          instance: req.originalUrl,
        })
      );
    }

    try {
      const job = await jobsCollection.findOne({ id });
      if (!job) {
        return res.status(404).type('application/problem+json').json(
          createProblemDetails({
            type: 'https://errors.seekers.internal/not-found',
            title: 'Not Found',
            status: 404,
            detail: `Job listing with id "${id}" was not found`,
            instance: req.originalUrl,
          })
        );
      }

      if (!isListingAvailable(job)) {
        const detail =
          job.status !== 'ACTIVE'
            ? `Job listing is ${job.status.toLowerCase()} and cannot be redirected`
            : 'Job listing has expired and is no longer accepting applications';

        return res.status(404).type('application/problem+json').json(
          createProblemDetails({
            type: 'https://errors.seekers.internal/listing-inactive',
            title: 'Listing Unavailable',
            status: 404,
            detail,
            instance: req.originalUrl,
          })
        );
      }

      const allowLocalhost = process.env.ALLOW_LOCAL_OUTBOUND === 'true' || process.env.NODE_ENV === 'test';
      const validation = validateOutboundUrl(job.canonical_url, { allowLocalhost });
      if (!validation.valid) {
        return res.status(400).type('application/problem+json').json(
          createProblemDetails({
            type: 'https://errors.seekers.internal/unsafe-outbound-url',
            title: 'Unsafe Destination URL',
            status: 400,
            detail: `Destination URL failed security validation: ${validation.reason}`,
            instance: req.originalUrl,
          })
        );
      }

      // Record outbound click intent non-blocking
      jobsCollection
        .updateOne({ id }, { $inc: { outbound_clicks: 1 }, $set: { last_outbound_at: new Date() } })
        .catch((telemetryErr) => console.warn('Telemetry update ignored:', telemetryErr.message));

      const destination_url = validation.normalizedUrl;

      // Handle Accept header: JSON vs Browser Redirect
      const acceptHeader = req.get('accept') || '';
      const wantsJson = req.query.format === 'json' || (acceptHeader.includes('application/json') && !acceptHeader.includes('text/html'));

      if (wantsJson) {
        return res.status(200).json({ destination_url });
      }

      // 302 redirect
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.redirect(302, destination_url);
    } catch (err) {
      console.error('Error in trackOutboundClick:', err);
      return res.status(500).type('application/problem+json').json(
        createProblemDetails({
          type: 'https://errors.seekers.internal/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to process outbound redirect: ' + err.message,
          instance: req.originalUrl,
        })
      );
    }
  });

  // 3. GET /:id - Single canonical job details
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(404).type('application/problem+json').json(
        createProblemDetails({
          type: 'https://errors.seekers.internal/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Job listing not found',
          instance: req.originalUrl,
        })
      );
    }

    if (!jobsCollection) {
      return res.status(503).type('application/problem+json').json(
        createProblemDetails({
          type: 'https://errors.seekers.internal/service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Catalog storage is currently unavailable',
          instance: req.originalUrl,
        })
      );
    }

    try {
      const job = await jobsCollection.findOne({ id });
      if (!job) {
        return res.status(404).type('application/problem+json').json(
          createProblemDetails({
            type: 'https://errors.seekers.internal/not-found',
            title: 'Not Found',
            status: 404,
            detail: `Job listing with id "${id}" was not found`,
            instance: req.originalUrl,
          })
        );
      }

      return res.status(200).json(toJobDetail(job));
    } catch (err) {
      console.error('Error fetching job by id:', err);
      return res.status(500).type('application/problem+json').json(
        createProblemDetails({
          type: 'https://errors.seekers.internal/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: 'Failed to fetch job details: ' + err.message,
          instance: req.originalUrl,
        })
      );
    }
  });

  return router;
}

module.exports = {
  createJobsRouter,
};
