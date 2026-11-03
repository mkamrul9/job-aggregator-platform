# Seekers Job Aggregator Platform — Independent Project Portfolio

A modern, production-grade distributed job aggregator platform engineered across seven decoupled, independently runnable microservices and user interfaces. Each project represents an autonomous subsystem with dedicated architecture, clean domain boundaries, automated testing, and standalone evaluation modes.

---

## 1. Portfolio Index & Microservice Directory

A reviewer or hiring team evaluating a specific stack (e.g., Python, Angular, Go, Next.js, or NestJS) can inspect and run that project directly without requiring the full polyglot fleet or external cluster dependencies.

| Project | Subsystem Directory | Primary Stack & Baseline | Architectural Role | Standalone Mode & Reviewer Quickstart |
|---|---|---|---|---|
| **1. Candidate Web App** | [`frontend-next/`](frontend-next/README.md) | Next.js 14.2, React 18, TypeScript, Tailwind CSS | Candidate discovery, faceted search, resume upload, and responsive workspace | Standalone Mock Adapter (`NEXT_PUBLIC_API_MOCK=true`) — [Quickstart](frontend-next/README.md#standalone-preview-mode) |
| **2. Operations Console** | [`frontend-admin/`](frontend-admin/README.md) | Angular 17.3, TypeScript, RxJS, Standalone Components | Platform monitoring, crawler control, catalog moderation, and audit logging | In-Memory Simulation Engine with zero backend credentials — [Quickstart](frontend-admin/README.md#standalone-demo-mode) |
| **3. Resume Extractor** | [`service-resume/`](service-resume/README.md) | Python 3.11, pdfplumber, FastAPI, gRPC, Pydantic | Privacy-first PDF resume parsing, schema extraction, and ATS scoring | Native Python Web UI (`uvicorn app.server:app`) & CLI parser — [Quickstart](service-resume/README.md#standalone-python-web-viewer-no-node--docker) |
| **4. Distributed Collector** | [`service-scraper/`](service-scraper/README.md) | Go 1.22, standard library `net/http`, rod, kafka-go | High-throughput web crawling, SSRF protection, rate limiting, and canonicalization | Standalone CLI (`go run main.go test-run`) with offline fixtures — [Quickstart](service-scraper/README.md#quickstart) |
| **5. Identity & Workspace** | [`service-user/`](service-user/README.md) | NestJS 10, TypeScript, Prisma ORM, PostgreSQL 16 | Authentication, candidate profiles, application tracking, and GDPR tombstone erasure | Isolated PostgreSQL with forward Prisma migrations — [Quickstart](service-user/README.md#3-verification--qualification-suite) |
| **6. Catalog & Search** | [`service-ingestion/`](service-ingestion/README.md) | Node.js 20, Express 5, MongoDB 7, Elasticsearch 8.13 | Canonical job storage, keyset cursor pagination, and zero-downtime index alias swaps | Standalone Search API with 12 curated South Asian seed jobs — [Quickstart](service-ingestion/README.md#5-standalone-quickstart-zero-kafka-dependency) |
| **7. Notification Engine** | [`service-notification/`](service-notification/README.md) | Node.js 20, Socket.io 4, KafkaJS, Express 5, Nodemailer | Real-time WebSocket broadcasting, preference matching, and RFC 8058 one-click unsubscribe | Standalone Event Replay CLI with local mailbox capture — [Quickstart](service-notification/README.md#5-standalone-cli--event-replay-showcase) |

---

## 2. Integrated Platform Architecture

```
                                  +-----------------------------+
                                  |   External Job Sources      |
                                  +--------------+--------------+
                                                 | (HTTP / Headless)
                                                 v
                                  +-----------------------------+
                                  | service-scraper (Go 1.22)   |
                                  | Rate Limiter, SSRF Guard    |
                                  +--------------+--------------+
                                                 | Kafka: jobs.raw.v1
                                                 v
                                  +-----------------------------+
                                  | service-ingestion (Node 20) |
                                  | Canonical Ingestion, Dedup  |
                                  +-------+--------------+------+
       Kafka: job.ingested.v1             |              |
   +--------------------------------------+              v
   |                                               +------------+
   v                                               | MongoDB 7  | (Store of Record)
+-------------------------------+                  +------------+
| service-notification (Node 20)|                        |
| - Token Preference Matcher    |                        v
| - Delivery State Machine      |                  +------------+
| - RFC 8058 One-Click Unsub    |                  | Elastic 8  | (Search Projection)
+---------------+---------------+                  +-----+------+
                |                                        |
                +---------------+  +---------------------+
                                |  | REST / Keyset Search API
                                v  v
+-------------------------------+  +-----------------------------+
| frontend-next (Next.js 14.2)  |  | frontend-admin (Angular 17) |
| - Candidate Job Search        |  | - Operations Dashboard      |
| - Application Tracker         |  | - Source Health & Controls  |
| - Resume Upload & Feedback    |  | - Catalog Moderation        |
+---------------+---------------+  +-----------------------------+
                |
                | gRPC (Port 50051)
                v
+-------------------------------+
| service-resume (Python 3.11)  |
| - pdfplumber Schema Extraction|
| - Private Memory Processing   |
| - Skills & Match Analysis     |
+-------------------------------+
```

---

## 3. Technology CV Summaries & Walkthrough Highlights

### Next.js & React Frontend (`frontend-next`)
- **CV Bullet:** Built a high-performance candidate web application using Next.js 14.2 (App Router), React 18, and Tailwind CSS. Implemented faceted search with keyset cursor pagination, interactive application tracking board, private PDF resume upload with real-time feedback, and full accessibility compliance (WCAG 2.1 AA).
- **Core Interview Topic:** State synchronization between URL search parameters, keyset pagination cursors, and responsive filter drawers without race conditions or extraneous re-renders.

### Angular Operations Console (`frontend-admin`)
- **CV Bullet:** Architected an enterprise operational administration console using Angular 17.3 with standalone components, RxJS reactive streams, and Angular Signals. Implemented crawler status controls, job catalog moderation queues, and an in-memory simulation engine operating with zero backend credentials.
- **Core Interview Topic:** Enforcing strict separation between in-memory simulation mode and protected live operator modes, backed by unidirectional data flow and observable state stores.

### Python Resume Extraction Microservice (`service-resume`)
- **CV Bullet:** Engineered a privacy-first resume extraction service in Python 3.11 using `pdfplumber`, Pydantic validation, and dual gRPC/FastAPI servers. Implemented deterministic section extraction, PII redaction, and in-memory parsing with zero persistent document retention.
- **Core Interview Topic:** Structuring resilient PDF layout parsing across multi-column formats and dual-protocol exposure (gRPC for high-throughput internal microservices; FastAPI for standalone local inspection).

### Go Distributed Collector (`service-scraper`)
- **CV Bullet:** Developed a concurrent web scraper and CLI in Go 1.22 using standard library `net/http`, Rod headless browsing, and KafkaJS ingestion. Built SSRF protection preventing private CIDR IP leakage, token-bucket rate limiting, and canonical schema mapping.
- **Core Interview Topic:** Safeguarding outbound web crawlers against SSRF vectors and DNS rebinding attacks while enforcing robust HTTP client timeouts and connection pool bounds.

### NestJS Identity & Workspace Microservice (`service-user`)
- **CV Bullet:** Built an enterprise identity, application tracking, and workspace API using NestJS 10, TypeScript, Prisma ORM, and PostgreSQL 16. Implemented role-based access control, cryptographic session handling, GDPR-compliant data export, and 30-day deletion grace periods with durable tombstone fencing.
- **Core Interview Topic:** Implementing durable erasure tombstones to enforce GDPR right-to-be-forgotten compliance and prevent background user-synchronization jobs from reviving deleted records.

### Node.js Ingestion & Search Microservice (`service-ingestion`)
- **CV Bullet:** Designed a resilient job catalog ingestion and search microservice in Node.js 20, MongoDB 7, and Elasticsearch 8. Implemented deduplication hashing, keyset cursor pagination, transactional outbox indexing, and zero-downtime Elasticsearch index reindexing via atomic alias swaps.
- **Core Interview Topic:** Dual-store consistency architecture leveraging MongoDB as the ACID store of record and Elasticsearch as the ephemeral search projection with automated outbox recovery.

### Node.js Real-Time Event & Notification Service (`service-notification`)
- **CV Bullet:** Built an event-driven notification microservice using Node.js 20, Socket.io 4, and KafkaJS. Engineered token-boundary candidate preference matching with currency normalization, crash-safe multi-worker delivery state machines with atomic file locking and corruption quarantine, and RFC 8058 one-click unsubscribe with HMAC-SHA256 signature verification.
- **Core Interview Topic:** Implementing RFC 8058 link-prefetch-resistant two-phase unsubscribe flows alongside atomic crash-safe file storage featuring cross-process reservation locks.

---

## 4. Verification & Testing Commands

To qualify the platform and individual subsystems from a clean environment:

```bash
# 1. Platform Data Contracts & Schema Validation
node contracts/validate-contracts.js

# 2. Crash-Safe Backup & HMAC Manifest Tamper Resistance Verification
node scripts/test-recovery-failure.js

# 3. Workload Benchmark Accounting & Real-Measurement Verification
node scripts/test-benchmark-accounting.js

# 4. Multi-Node Resilience & Fault-Injection Suite
node scripts/run-resilience-faults.js

# 5. Candidate & Operator End-to-End Beta Journey Qualification (9 Scenarios)
node scripts/qualify-beta-journeys.js

# 6. Service Unit Test Suites
cd service-notification && npm test && cd ..
cd service-ingestion && npm test && cd ..
cd service-user && npm test && cd ..
cd frontend-admin && npm test -- --watch=false --browsers=ChromeHeadless && cd ..
cd service-resume && pytest && cd ..
cd service-scraper && go test ./... && cd ..
```
