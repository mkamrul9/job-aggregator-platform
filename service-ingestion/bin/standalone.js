#!/usr/bin/env node
// service-ingestion/bin/standalone.js
// Quickstart runner: starts the jobs search API with only MongoDB and (optionally) Elasticsearch,
// without requiring Kafka, Scraper, Python, or Angular.

process.env.STANDALONE_MODE = 'true';
const { run } = require('../index');

run();
