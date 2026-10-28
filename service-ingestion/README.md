# Node.js Canonical Job Catalog & Unified Search API (`service-ingestion`)

A high-performance streaming ingestion worker and REST discovery service that consumes scraped job postings from Kafka (or standalone file streams), canonicalizes records into MongoDB (the authoritative persistent catalog), and projects indexed search documents into Elasticsearch (with transparent fallback to MongoDB).

> **Role in Seekers Platform:** Powers candidate job discovery, multi-dimensional search filtering, keyset pagination, shareable job details, and verified outbound application redirects across the platform.

---

## 1. Technology Stack & Storage Layer

- **Runtime:** Node.js 22.x LTS
- **Web Framework:** Express 5.x
- **Event Streaming:** KafkaJS 2.x (Consumer Group: `mongo-ingestion-group`, Topics: `job.collected.v1`, `jobs.new`)
- **Authoritative Catalog:** MongoDB Node Driver 7.x (Collection: `jobs`, `dead_letters`)
  - Unique indexes on `id` (public UUID v4), `canonical_url`, and `source_url_hash`.
  - Projection status index on `projection_status` (`PENDING`, `INDEXED`, `FAILED`).
  - Compound indexes on `[status, published_at, id]` and `[status, salary.min, id]` for deterministic keyset pagination.
  - Text search index on `title`, `company`, `description`, `skills`, `location`.
- **Search Projection:** `@elastic/elasticsearch` 8.x (Index Alias: `jobs_index`)
  - Multi-match full text search across `title^3`, `skills^2`, `company^2`, `description`.
  - Strict filters on `status: "ACTIVE"`, `location`, `remote_eligibility`, `job_type`, `seniority`, and salary ranges.
  - Transparent fallback to MongoDB text search if Elasticsearch is unreachable.
- **Recoverable Delivery Semantics:**
  - Manual Kafka offset commits: offsets advance **only** after canonical MongoDB persistence or durable dead-letter quarantine.
  - Poison message isolation: malformed events are persisted to `dead_letters` with validation error diagnostics before committing offsets, preventing partition head-of-line blocking.
  - Idempotent upserts: duplicate events preserve `first_seen_at` and do not bump revision numbers or dirty the search projection.

---

## 2. Architecture & Recoverable Data Flow

```
               +--------------------------------------+
               |  service-scraper (Go Engine)         |
               +-------------------+------------------+
                                   | (Kafka: job.collected.v1)
                                   v
               +--------------------------------------+
               |  service-ingestion Consumer Worker   |
               |  - SeekersEventEnvelope Validator    |
               |  - Poison Message Gate               |
               +---------+------------------+---------+
                         |                  |
           (Valid Event) |                  | (Poison / Malformed)
                         v                  v
                 +---------------+  +------------------+
                 | MongoDB: jobs |  | MongoDB:         |
                 | Authoritative |  | dead_letters     |
                 | (Rev, Outbox) |  | (Quarantined)    |
                 +-------+-------+  +------------------+
                         |
                         | (Commit Kafka Offset)
                         v
                 +---------------+
                 | Projection    |
                 | Outbox Worker |
                 +-------+-------+
                         | (Optimistic Revision Check)
                         v
                 +---------------+
                 | Elasticsearch |
                 | jobs_index    |
                 | (Projection)  |
                 +---------------+
```

---

## 3. Endpoints & API Contract

The service implements the OpenAPI 3.1 contract under `/api/v1/jobs` and provides full backwards-compatible support for `/api/jobs` (with and without trailing slashes).

| Method | Path | Description | Key Query / Path Parameters | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/jobs` | Search & filter active job catalog | `q`, `location`, `remote_eligibility`, `job_type`, `seniority`, `min_salary`, `currency`, `sort`, `limit`, `cursor` | `JobListResponse` (items, total_count, next_cursor, prev_cursor) |
| `GET` | `/api/jobs` | Legacy alias to search endpoint | Same as `/api/v1/jobs` | `JobListResponse` |
| `GET` | `/api/v1/jobs/:id` | Retrieve full canonical job detail | `id` (UUID v4) | `JobDetail` (404 RFC 7807 if not found) |
| `GET` | `/api/v1/jobs/:id/outbound` | Safe outbound application redirect | `id` (UUID v4), `Accept: text/html` or `Accept: application/json` | `302 Redirect` to source or `200` with `{ destination_url }` |
| `GET` | `/health` | Health check endpoint | None | `200` with `{ status: "healthy", ... }` |

---

## 4. Standalone Event Runner & Operator CLI

### Deterministic Event Replay (Zero Kafka Dependency)
Process raw event streams from NDJSON files or standard input using the identical validation and persistence core:

```bash
# Process NDJSON event stream into MongoDB and Elasticsearch
npm run event-runner -- --file=test/fixtures/collected_events.ndjson

# Dry-run validation mode (validates schema without persisting)
npm run event-runner -- --file=test/fixtures/collected_events.ndjson --dry-run
```

### Operator Command-Line Interface (`bin/operator.js`)

```bash
# Inspect catalog health, projection lag, and dead letter counts
npm run operator -- status

# List quarantined poison events
npm run operator -- dead-letters list

# Inspect payload and validation failure reasons for a specific dead letter
npm run operator -- dead-letters inspect <id>

# Reconcile MongoDB canonical catalog against Elasticsearch projection
npm run operator -- reconcile --dry-run
npm run operator -- reconcile

# Rebuild search index with zero downtime via atomic alias swap
npm run operator -- reindex
```

---

## 5. Standalone Quickstart (Zero Kafka Dependency)

### 1. Install Dependencies
```bash
cd service-ingestion
npm ci
```

### 2. Seed Initial Catalog Data
Seeds 12 curated South Asian & Bangladesh tech job postings into MongoDB and builds the Elasticsearch index:
```bash
npm run seed
```

### 3. Start Search API in Standalone Mode
```bash
npm run start:standalone
```

---

## 6. Verification & Testing

```bash
# Run unit tests (models, schema validation, URL security, query validators, endpoint mocks)
npm test

# Run strict integration tests (live MongoDB and Elasticsearch)
npm run test:integration
```
