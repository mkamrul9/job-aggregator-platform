# Seekers Platform Service Catalog

*Status: Authoritative Service Catalog — Baseline Established for Phase 1 (P01)*  
*Last Updated: 27 October 2026*  
*Architecture Pattern: Polyglot Microservices Monorepo with Independently Presentable Services*

---

## 1. Catalog Overview & Monorepo Principles

The Seekers prototype is organized as a polyglot microservices monorepo with a production roadmap. Every project retains its technology specialization and dependency manifest. Independent quickstarts, complete test suites, and production verification are still being established.

A primary requirement of this architecture is that **each project is independently demonstrable** for technology-specific evaluations (e.g. evaluating the Python extractor without spinning up PostgreSQL, Kafka, or React; or evaluating the Angular operations dashboard without the entire backend fleet). Standalone demonstrations use the exact same core business logic as platform mode, with external dependencies replaced by clearly labelled adapters or synthetic fixtures.

### Global Command Status Taxonomy

To maintain engineering honesty, all commands in this catalog are classified using three explicit tiers:
- **`[Verified]`**: A reported local check passed in the P01 baseline; it is not proof of a fresh CI pass or a full user journey.
- **`[Observed-but-unverified]`**: Present in package scripts or configuration, executed but exhibiting known blockers/partial output.
- **`[Planned]`**: Designed for implementation in the owning feature phase (P02–P16); not yet working or implemented.

---

## 2. Service Directory

| Identifier | Service Name | Primary Stack | Owning Phase | Status Baseline |
|---|---|---|---|---|
| `service-resume` | Python Resume Extractor | Python 3.11+, FastAPI, spaCy, pypdf, gRPC | P08 | Pytest unit tests pass (3/3); pypdf migration complete; GET /health added |
| `frontend-admin` | Angular Operations Dashboard | Angular 18, TypeScript, RxJS, Socket.io | P12 | Production build passes; test:ci script added; enabled in Compose & gateway |
| `service-scraper` | Go Job Collection Engine | Go 1.23, Playwright-Go, Kafka-Go | P07 | `go test` and `go vet` pass cleanly; module mode verified |
| `service-user` | NestJS Identity & Profile API | NestJS 11, TypeScript, Prisma, PostgreSQL | P05 | ESLint passes (0 errors); tsc & Jest pass; Prisma migration 20261027000000_init established |
| `service-ingestion` | Node.js Job Ingestion & Search API | Node.js 22, Express, KafkaJS, MongoDB, ES 8.x | P07 | Aligned with Elasticsearch 8.x; 8 unit tests pass; Express & regex escaping verified |
| `service-notification`| Node.js Notification Delivery Service | Node.js 22, Express, Socket.io, KafkaJS, Nodemailer | P11 | Safe jsonTransport default; 5 unit tests pass; Socket.io & metric counter verified |
| `frontend-next` | React/Next.js Candidate App | Next.js 16.3, React 19.2, TypeScript, ES 8.x | P06 | ESLint passes (0 errors); Turbopack production build passes; ES 8.x client aligned |

---

## 3. Individual Service Specifications

---

### 3.1 `service-resume` — Python Resume Extractor

- **Purpose & Role:** Ingests candidate resumes in PDF format, performs text extraction, and applies natural language processing (spaCy phrase matching) against a technical skills taxonomy to produce structured candidate skill profiles.
- **Primary Technology:** Python 3.11 (local environment currently 3.14; container target 3.11), FastAPI, PyPDF2, spaCy (`en_core_web_sm`), gRPC (`grpcio`, `protobuf`).
- **Data Ownership:** Owns no permanent database. Temporarily processes file streams and local upload buffers (`/uploads`). Generates structured JSON and gRPC protobuf payloads (`ParseResponse`).
- **Entry Points & Interfaces:**
  - REST: `POST /parse` (FastAPI multipart/form-data upload)
  - gRPC: `ResumeParser.ParseResume` on port `50051` (implements `shared-protos/resume.proto`)
  - Interactive Documentation: `GET /docs` (Swagger UI) and `GET /redoc`
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-resume/requirements.txt`
  - Runtime Protobuf Artifacts: `service-resume/resume_pb2.py`, `service-resume/resume_pb2_grpc.py`
  - Protobuf Source: `shared-protos/resume.proto`
- **Commands & Verification:**
  - Test: `pytest test_main.py` — `[Verified]` (passes in local environment; notes PyPDF2 deprecation warning)
  - Lint/Format: `flake8 .` / `black --check .` — `[Planned]` (scheduled for P02 pipeline)
  - Local Run (HTTP): `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` — `[Observed-but-unverified]` (fresh startup not established by the two tests)
  - Local Run (gRPC): `python grpc_server.py` — `[Observed-but-unverified]` (not covered by the existing HTTP tests)
- **Required Infrastructure:**
  - None required for standalone parsing.
  - Inter-service mode requires shared volume access (`/uploads`) with `service-user`.
- **Current Verification Status:** Two HTTP tests pass, including a mocked PDF path. PyPDF2 generates deprecation notices; the dictionary has 16 entries. The application does not consume a `.env` file or configurable upload-limit settings yet.
- **Standalone-Readiness Gaps:**
  - No lightweight, self-contained HTML/web upload UI served by Python.
  - Anonymous HTTP endpoint does not enforce upload size or rate bounds.
  - Relies on shared host filesystem paths passed over gRPC rather than object storage / byte streams.
- **Planned Standalone Demonstration (P08):**
  - Standalone FastAPI web interface serving a clean HTML/CSS upload and interactive results screen.
  - Preloaded synthetic sample resumes demonstrating skill extraction and unsupported format handling.
  - Downloadable structured JSON output and interactive OpenAPI Swagger documentation.
  - Zero external platform dependencies required to run the demo.
- **Intended Deployment Boundary:**
  - Docker container: `service-resume/Dockerfile`
  - Ports: `8000` (HTTP/REST), `50051` (gRPC)
  - Owning Feature Phase: **P08**

---

### 3.2 `frontend-admin` — Angular Operations Dashboard

- **Purpose & Role:** Provides operational monitoring, real-time job ingestion telemetry, and moderation tools for platform administrators.
- **Primary Technology:** Angular 18, TypeScript 5.5, SCSS, RxJS 7.8, Socket.io-client 4.8; current app uses NgModules.
- **Data Ownership:** UI presentation layer; owns no persistence. Consumes live WebSocket events from `service-notification` and REST telemetry endpoints.
- **Entry Points & Interfaces:**
  - Web UI: Port `4200` (local dev `ng serve`) / Port `80` inside Nginx production container
  - WebSocket Consumer: Connects to `http://localhost:4000` (event: `live-job-feed`)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `frontend-admin/package.json`
  - Lockfile: `frontend-admin/package-lock.json`
- **Commands & Verification:**
  - Build: `npm run build` — `[Verified]` (production compilation succeeds)
  - Test: `npm test -- --watch=false --browsers=ChromeHeadless` — `[Observed-but-unverified]` (requires configured headless browser)
  - Lint: `npm run lint` — `[Planned]` (scheduled for P02)
  - Local Dev: `npm start` (`ng serve`, default port 4200) — `[Observed-but-unverified]` (fresh runtime verification still required)
- **Required Infrastructure:**
  - Planned standalone mode: No backend fleet required after P12's synthetic feed is implemented. There is no working demo switch or `.env` loading today.
  - Integrated mode: `service-notification` (Socket.io on port 4000) and API gateway.
- **Current Verification Status:** Compiles cleanly to production bundle (`dist/frontend-admin`). In Compose, the service is currently commented out and its socket endpoint assumes localhost rather than gateway routing.
- **Standalone-Readiness Gaps:**
  - Hardcoded connection to `http://localhost:4000` with no fallback when notification service is absent.
  - Header, sidebar, and metric panels contain placeholder values.
  - Needs Angular upgrade and supported release validation.
- **Planned Standalone Demonstration (P12):**
  - A planned synthetic demonstration mode with an explicit configuration contract, streaming simulated job intake events. No `NG_APP_*` switch is currently implemented.
  - Filterable audit logs, mock metric gauges, and job moderation inspection cards.
  - Independent recruiter evaluation without operating Kafka, Elasticsearch, or backend services.
- **Intended Deployment Boundary:**
  - Multi-stage Nginx container: `frontend-admin/Dockerfile`
  - Ports: `4200` (host mapping) -> `80` (container internal)
  - Owning Feature Phase: **P12**

---

### 3.3 `service-scraper` — Go Job Collection Engine

- **Purpose & Role:** Automated job collection engine that scrapes career pages and job listings, normalizes raw HTML data into structured job records, and publishes events to Kafka.
- **Primary Technology:** Go 1.23, Playwright-Go v0.6100.0, Segmentio Kafka-Go v0.4.51.
- **Data Ownership:** Stateless collector. Reads external web sources; emits structured JSON events to Kafka topic `jobs.new`.
- **Entry Points & Interfaces:**
  - Kafka Producer: Publishes to topic `jobs.new`
  - CLI: Standalone collection binary (`scraper-bin`)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-scraper/go.mod`
  - Lockfile: `service-scraper/go.sum`
  - Dependency Policy: Module-based retrieval (`go.mod` / `go.sum`). Vendoring directory untracked from Git.
- **Commands & Verification:**
  - Test: `go test -v ./...` — `[Verified]` (passes in 0.8s using mock publisher)
  - Vet: `go vet ./...` — `[Verified]` (passes with zero defects)
  - Local Run: `go run .` — `[Observed-but-unverified]` (requires local Kafka broker on `localhost:9092` or mock adapter)
- **Required Infrastructure:**
  - Standalone mode: None (with planned CLI/fixture output mode).
  - Integrated mode: Apache Kafka broker (`KAFKA_BROKER`).
- **Current Verification Status:** Core logic and concurrency channels compile cleanly. Unit tests exercise the mock publisher. Real scraper relies on hardcoded example targets and single selector set.
- **Standalone-Readiness Gaps:**
  - The executable always configures Kafka and has no implemented stdout/file adapter. Publish failures are logged without durable replay.
  - Scrapes mock/hardcoded LinkedIn URLs with no source selector abstraction or rate limiting.
- **Planned Standalone Demonstration (P07):**
  - Standalone CLI mode (`--output=json` / `--fixture=sample.html`) allowing offline testing against local HTML snapshots.
  - Output to stdout or JSON file with structured fields (title, company, description, salary, location).
  - Demonstrates goroutine worker pool, retry backoff, and parser resilience without external network dependencies.
- **Intended Deployment Boundary:**
  - Container: `service-scraper/Dockerfile` (Ubuntu 22.04 base with Chromium and Playwright dependencies)
  - Owning Feature Phase: **P07**

---

### 3.4 `service-user` — NestJS Identity & Profile API

- **Purpose & Role:** Provides authenticated user profile management, candidate skill inventories, resume upload coordination, and Firebase token verification.
- **Primary Technology:** NestJS 11, TypeScript 5.7, Prisma ORM 5.x, PostgreSQL 15, `@grpc/grpc-js`, Firebase Admin SDK.
- **Data Ownership:** PostgreSQL database `job_aggregator_users`, with the current `User` and `Profile` models. Skills and the optional resume URL are fields on `Profile`, not separate entities.
- **Entry Points & Interfaces:**
  - REST API: Port `3000` (exposed on host `3002` via Docker Compose)
    - `POST /users/sync` (Firebase JWT authentication & account upsert)
    - `POST /users/upload-resume` (multipart upload & gRPC dispatch)
    - Gateway prefix: `/api/users/`; profile read/edit endpoints are planned, not implemented.
  - gRPC Client: Connects to `service-resume` on `RESUME_GRPC_URL`
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-user/package.json`
  - Lockfile: `service-user/package-lock.json`
  - Prisma Schema: `service-user/prisma/schema.prisma`
- **Commands & Verification:**
  - Test: `npm test` — `[Verified]` (1 Jest unit test passes)
  - TypeScript Check: `npx tsc --noEmit` — `[Verified]` (zero compilation errors)
  - Lint: `npm run lint` — `[Observed-but-unverified]` (reports 59 errors and 3 warnings to fix in P02)
  - Prisma Generate: `npx prisma generate` — `[Verified]`
  - Database Migration: `npx prisma migrate dev` / `migrate deploy` — `[Planned]` (migrations baseline in P02)
- **Required Infrastructure:**
  - PostgreSQL 15 (`DATABASE_URL`).
  - Firebase Auth emulator or live Google Cloud credentials (`FIREBASE_PROJECT_ID`).
  - `service-resume` gRPC endpoint (`RESUME_GRPC_URL`) for upload pipeline.
- **Current Verification Status:** Controller, services, guards, and Prisma models compile. Linter requires cleanup. Prisma migrations history needs baselining (previously ignored in `.gitignore`).
- **Standalone-Readiness Gaps:**
  - Lacks local migration baseline (`prisma/migrations`).
  - Firebase guard relies on live credentials or unconfigured default credentials.
  - Resume upload requires active gRPC service and shared `/uploads` volume.
- **Planned Standalone Demonstration (P05):**
  - Standalone quickstart with dedicated local PostgreSQL container and Firebase Auth emulator.
  - Complete OpenAPI Swagger interactive specification and Postman/curl collections.
  - Independent identity syncing, profile CRUD, and mock resume gRPC adapter.
- **Intended Deployment Boundary:**
  - Container: `service-user/Dockerfile`
  - Ports: `3000` (internal) / `3002` (host)
  - Owning Feature Phase: **P05**

---

### 3.5 `service-ingestion` — Node.js Job Ingestion & Search API

- **Purpose & Role:** High-throughput streaming consumer that ingests raw job listings from Kafka, deduplicates records, persists full documents to MongoDB, and projects searchable records into Elasticsearch. Also serves the REST search endpoint.
- **Primary Technology:** Node.js 20 container, Express 5.x, KafkaJS 2.x, MongoDB Node Driver 7.x, `@elastic/elasticsearch` 9.x; server/client alignment is a P02 blocker.
- **Data Ownership:** Authoritative owner of MongoDB database `job_platform` (collection: `jobs`). Dual-writes search projections to Elasticsearch index `jobs_index`.
- **Entry Points & Interfaces:**
  - Kafka Consumer: Topic `jobs.new` (Consumer Group: `mongo-ingestion-group`)
  - REST API: Port `5000`
    - `GET /api/jobs` (paged search with query filtering)
    - `GET /health` (service health)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-ingestion/package.json`
  - Lockfile: `service-ingestion/package-lock.json`
- **Commands & Verification:**
  - Syntax Check: `node --check index.js` — `[Verified]` (syntax valid)
  - Test: `npm test` — `[Observed-but-unverified]` (placeholder script exits with error 1; tests planned for P02)
  - Local Run: `node index.js` — `[Observed-but-unverified]` (requires active MongoDB, Kafka, and Elasticsearch)
- **Required Infrastructure:**
  - MongoDB 6+ (`MONGO_URI`).
  - Apache Kafka (`KAFKA_BROKER`).
  - Elasticsearch 8+ (`ES_NODE`).
- **Current Verification Status:** Express server and dual-write consumer logic syntax-checked. Package test script is unpopulated. Elasticsearch client 9.x against 8.10.2 container requires alignment in P02.
- **Standalone-Readiness Gaps:**
  - Fails on boot if Kafka, MongoDB, or Elasticsearch is not reachable.
  - Ingestion errors during ES indexing are logged but have no dead-letter queue or retry reconciliation.
  - Overlaps with `frontend-next`'s internal `/api/jobs` route (routing ownership decision required in P03).
- **Planned Standalone Demonstration (P07):**
  - Deterministic event replay runner reading local NDJSON fixture files directly into MongoDB/Elasticsearch.
  - Focused search API quickstart demonstrating queries, facets, and pagination against seeded fixtures.
  - Standalone verification script independent of Kafka.
- **Intended Deployment Boundary:**
  - Container: `service-ingestion/Dockerfile`
  - Ports: `5000`
  - Owning Feature Phase: **P07**

---

### 3.6 `service-notification` — Node.js Notification Delivery Service

- **Purpose & Role:** Listens for newly ingested jobs on Kafka, broadcasts real-time updates to connected admin dashboards via WebSockets (Socket.io), and dispatches email alerts to matching candidates using Nodemailer.
- **Primary Technology:** Node.js 20 container, Express 5.x, Socket.io 4.x, KafkaJS 2.x, Nodemailer 9.x, prom-client 15.x.
- **Data Ownership:** Stateless delivery worker. Exposes Prometheus operational metrics (`job_notifications_sent_total`, process metrics).
- **Entry Points & Interfaces:**
  - Kafka Consumer: Topic `jobs.new` (Consumer Group: `email-notification-group`)
  - WebSocket Server: Port `4000` (event: `live-job-feed`)
  - REST API: Port `4000`
    - `GET /health` (health check)
    - `GET /metrics` (Prometheus metrics exposition)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-notification/package.json`
  - Lockfile: `service-notification/package-lock.json`
- **Commands & Verification:**
  - Syntax Check: `node --check index.js` — `[Verified]` (syntax valid)
  - Test: `npm test` — `[Observed-but-unverified]` (placeholder script; tests planned for P02)
  - Local Run: `node index.js` — `[Observed-but-unverified]` (requires Kafka broker)
- **Required Infrastructure:**
  - Apache Kafka (`KAFKA_BROKER`).
  - SMTP Server or local sandbox (Ethereal Email / Mailpit).
- **Current Verification Status:** Express, Socket.io, and Prometheus metrics endpoints implemented. Email dispatcher uses hardcoded Ethereal fake credentials and single hardcoded recipient.
- **Standalone-Readiness Gaps:**
  - Requires Kafka to process any notification.
  - SMTP credentials and recipient addresses are not driven by candidate preference records.
  - No dead-letter recovery on failed email deliveries.
- **Planned Standalone Demonstration (P11):**
  - Event injection script publishing synthetic job events into the notification loop.
  - Local webmail capture UI (e.g. Mailpit) displaying generated alerts with HTML templates.
  - Real-time Socket.io diagnostic client showing incoming job payloads and live Prometheus metrics graph.
- **Intended Deployment Boundary:**
  - Container: `service-notification/Dockerfile`
  - Ports: `4000`
  - Owning Feature Phase: **P11**

---

### 3.7 `frontend-next` — React/Next.js Candidate App

- **Purpose & Role:** Primary public-facing candidate portal for discovering job opportunities, executing full-text searches, managing candidate authentication, and uploading resumes.
- **Primary Technology:** Next.js 16.3.0, React 19.2.8, TypeScript 5.x, Tailwind CSS / Vanilla CSS, Firebase Client SDK, `@elastic/elasticsearch` 9.x.
- **Data Ownership:** Web client; caches search results in React state. Server-side API route `/api/jobs` queries Elasticsearch directly.
- **Entry Points & Interfaces:**
  - Web UI: Port `3000` (local dev) / Port `3003` (Docker host port)
  - Server-Side Route: `GET /api/jobs` (Elasticsearch proxy route)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `frontend-next/package.json`
  - Lockfile: `frontend-next/package-lock.json`
- **Commands & Verification:**
  - Lint: `npm run lint` — `[Observed-but-unverified]` (reports 6 ESLint errors to resolve in P02)
  - Build: `npm run build` — `[Observed-but-unverified]` (Turbopack/CSS subprocess failure diagnosed for P02)
  - Local Dev: `npm run dev` — `[Observed-but-unverified]` (runs on port 3000)
- **Required Infrastructure:**
  - Elasticsearch (`ES_NODE`) for internal server-side search route.
  - API Gateway (`nginx`) for reverse proxying `/api/users/*` and `/api/resume/*`.
  - Firebase project; client-side emulator connection is not implemented yet.
- **Current Verification Status:** Rich UI components present (JobSearch, ResumeUpload, AuthComponent, Navbar). Production build fails under Windows sandbox/Turbopack, and lint errors require resolution.
- **Standalone-Readiness Gaps:**
  - Turbopack build failure and stale generated types must be fixed in P02.
  - Direct dependency on Elasticsearch from Next.js server route duplicates `service-ingestion` responsibility.
  - Hardcoded public marketing statistics (e.g. "2.4M+ jobs", "180+ sources") must be tied to actual catalog data.
- **Planned Standalone Demonstration (P06):**
  - Standalone Next.js demo mode running against seeded mock fixtures or local mock API handlers.
  - Fully responsive job search, filter panel, and candidate account workspace.
  - Clearly labelled UI demo mode ensuring zero unverified production claims.
- **Intended Deployment Boundary:**
  - Container: `frontend-next/Dockerfile`
  - Ports: `3000` (internal) / `3003` (host)
  - Owning Feature Phase: **P06**

---

## 4. Supporting Infrastructure & Gateway

| Component | Technology | Primary Role | Host Port | Internal Port |
|---|---|---|---|---|
| `api-gateway` | Nginx Alpine | HTTP reverse proxy and path routing; TLS is not configured | `80` | `80` |
| `kafka` | Apache Kafka (KRaft) | Asynchronous event bus (`jobs.new`) | `9092` | `9092` |
| `user-postgres`| PostgreSQL 15 | Relational persistence for user accounts & profiles | `5433` | `5432` |
| `job-mongo` | MongoDB 6+ | Unstructured document store for ingested jobs | `27017` | `27017` |
| `elasticsearch`| Elasticsearch 8.10.2 | Full-text search engine and indexing projection | `9200` | `9200` |
| `prometheus` | Prometheus | Metrics collection and scraping (notification service) | `9090` | `9090` |
| `grafana` | Grafana | Visualization dashboards and alerting | `3004` | `3000` |

---

## 5. Security & Secret Hygiene Baseline

1. **Remote Repository URL:** Configured with clean, credential-free URL (`https://github.com/mkamrul9/job-aggregator-platform.git`) using Git Credential Manager (`manager`). No credentials embedded in Git configuration.
2. **Environment Files:** All `.env` and `.env.*` files are untracked and ignored via root and service-level `.gitignore` files.
3. **Configuration Examples:** Tracked examples contain variables actually consumed by a current service or SDK. The root Compose file currently uses hardcoded values, and Angular/Python apps do not load `.env`; their unused draft examples stay local. A reference file is not proof of an environment loader or an enforced security limit.
4. **Local Secrets:** Kept strictly local (e.g. `.secrets`, `docs/token_cmd.txt` are gitignored).
