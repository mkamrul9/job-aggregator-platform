# Node.js Canonical Job Catalog & Unified Search API (`service-ingestion`)

A high-performance streaming ingestion worker and REST discovery service that consumes scraped job postings from Kafka, canonicalizes records into MongoDB (the authoritative persistent catalog), and projects indexed search documents into Elasticsearch (with transparent fallback to MongoDB).

> **Role in Seekers Platform:** Powers candidate job discovery, multi-dimensional search filtering, keyset pagination, shareable job details, and verified outbound application redirects across the platform.

---

## 1. Technology Stack & Storage Layer

- **Runtime:** Node.js 22.x
- **Web Framework:** Express 5.x
- **Event Streaming:** KafkaJS 2.x (Consumer Group: `mongo-ingestion-group`)
- **Authoritative Catalog:** MongoDB Node Driver 7.x (Collection: `jobs`)
  - Unique indexes on `id` (public UUID v4) and `canonical_url`.
  - Compound indexes on `[status, published_at, id]` and `[status, salary.min, id]` for deterministic keyset pagination.
  - Text search index on `title`, `company`, `description`, `skills`, `location`.
- **Search Projection:** `@elastic/elasticsearch` 8.x (Index: `jobs_index`)
  - Multi-match full text search across `title^3`, `skills^2`, `company^2`, `description`.
  - Strict filters on `status: "ACTIVE"`, `location`, `remote_eligibility`, `job_type`, `seniority`, and salary ranges.
  - Transparent fallback to MongoDB text/regex search if Elasticsearch is unreachable.
- **Security & Safety:**
  - RFC 7807 Problem Details (`application/problem+json`) for all validation and HTTP error responses.
  - SSRF protection: outbound redirect destinations strictly validate against IPv4/IPv6 private ranges (RFC 1918, ULA `fc00::/7`), loopback (`127.0.0.0/8`, `::1`), link-local metadata addresses (`169.254.169.254`, `fe80::/10`), single-label intranet hosts, credentials, and non-http(s) schemes.
  - Lifecycle enforcement: outbound redirection requires active listings; expired or flagged listings return 404 RFC 7807 problem details.

---

## 2. Architecture & Data Flow

```
               +--------------------------------------+
               |  service-scraper (Go Engine)         |
               +-------------------+------------------+
                                   | (Kafka topic: jobs.new)
                                   v
               +--------------------------------------+
               |  service-ingestion (Node.js)         |
               |  - Kafka Consumer Worker             |
               |  - Express Search API (:5000)        |
               +---------+------------------+---------+
                         |                  |
                         v                  v
                 +---------------+  +------------------+
                 | MongoDB       |  | Elasticsearch    |
                 | (Authoritative|  | (Rebuildable     |
                 |  Store)       |  |  Index)          |
                 +---------------+  +------------------+
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

### Deterministic Keyset Cursor Pagination

Pagination uses opaque, URL-safe base64-encoded keyset cursors encoding the active sort field value and the listing UUID tie-breaker:
- `sort=date_desc` (default): `[published_at, id]`
- `sort=salary_desc`: `[salary.min, id]`
- `sort=relevance`: Elasticsearch score-based pagination

---

## 4. Standalone Quickstart (Zero Kafka Dependency)

Developers and frontend consumers can run `service-ingestion` locally without Kafka:

### 1. Install Dependencies
```bash
cd service-ingestion
npm ci
```

### 2. Seed Initial Catalog Data
Seeds 12 curated South Asian & Bangladesh tech job postings into MongoDB and builds the Elasticsearch index:
```bash
# Defaults to mongodb://localhost:27017/job_aggregator and http://localhost:9200
npm run seed
```

### 3. Start Search API in Standalone Mode
```bash
# Disables Kafka consumer and exposes /api/v1/jobs on port 5000
npm run start:standalone
```

---

## 5. Verification & Testing

```bash
# Run unit tests (models, URL security, query validators, endpoint mocks)
npm test

# Run strict integration tests (live MongoDB and Elasticsearch)
npm run test:integration
```
