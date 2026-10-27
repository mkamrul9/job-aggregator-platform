# Node.js Job Ingestion & Search API (`service-ingestion`)

A stream-processing worker and REST search service that consumes newly scraped job events from Kafka, persists canonical records in MongoDB, and projects indexed documents into Elasticsearch.

> **Role in Seekers Platform:** Serves as the central data ingestion pipeline between raw collection (`service-scraper`) and candidate search queries. It dual-writes listings to MongoDB (authoritative document store) and Elasticsearch (search projection).

---

## 1. Primary Technology Stack

- **Runtime:** Node.js 20.x
- **Web Framework:** Express 4.x
- **Event Streaming:** KafkaJS 2.x (Consumer Group: `mongo-ingestion-group`)
- **Document Store:** MongoDB Node Driver 6.x (Database: `job_platform`, Collection: `jobs`)
- **Search Engine:** `@elastic/elasticsearch` (Index: `jobs_index`)
- **Security:** ReDoS input escaping, CORS origin protection

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

### Endpoints

| Method | Route | Description | Query Parameters |
|---|---|---|---|
| `GET` | `/api/jobs` | Paginated search across listings | `q` (keyword), `page` (int), `limit` (max 100) |
| `GET` | `/health` | Health check endpoint | None |

---

## 3. Current Capabilities & Baseline Status

- **Syntax & Parse Check (`node --check index.js`):** `[Verified]` — valid JavaScript syntax.
- **Express Jobs Search API:** Implements pagination, limit clamps, and ReDoS regex sanitization.
- **Dual-Write Pipeline:** Upserts documents into MongoDB by URL and mirrors structured documents to Elasticsearch.
- **Known Limitations:**
  - Elasticsearch indexing failures are caught and logged, but lack durable dead-letter queues or automatic retry reconciliation.
  - Test runner (`npm test`) is currently a placeholder script scheduled for full test implementation in P02.
  - Elasticsearch JS client (9.x) and Elasticsearch container (8.10.2) have a major-version disparity to be aligned in P02.

---

## 4. Setup & Local Execution

### Prerequisites

- Node.js 20.x
- MongoDB 6+
- Apache Kafka
- Elasticsearch 8+

### Installation

```bash
cd service-ingestion
npm install
```

### Configuration

Copy the example configuration:
```bash
cp .env.example .env
```
Key configuration settings (see `.env.example`):
- `PORT`: HTTP port for Express (default: `5000`)
- `KAFKA_BROKER`: Kafka broker address (default: `localhost:9092`)
- `MONGO_URI`: MongoDB connection string (default: `mongodb://localhost:27017`)
- `ES_NODE`: Elasticsearch node address (default: `http://localhost:9200`)

### Running the Worker & API

```bash
node index.js
```

---

## 5. Planned Standalone Demonstration (Phase P07)

In Phase P07, this ingestion and search service will feature an independent demonstration mode:
- **Local Fixture Replay:** An offline event replay script reading local NDJSON listing files directly into MongoDB and Elasticsearch without requiring an active Kafka broker.
- **Search Verification Suite:** Validates keyword queries, facet counts, and pagination directly against the seeded search index.
