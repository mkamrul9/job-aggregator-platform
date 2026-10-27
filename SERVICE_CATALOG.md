# Seekers Platform Service Catalog

*Status: Authoritative Service Catalog — Responsive Design & Prototypes Complete for Phase 4 (P04)*  
*Last Updated: 27 October 2026*  
*Architecture Pattern: Polyglot Microservices Monorepo with Independently Presentable Services*

---

## 1. Catalog Overview & Monorepo Principles

The Seekers platform is organized as a polyglot microservices monorepo. Every project retains its technology specialization, dependency manifest, build artifacts, and runtime configuration boundary.

A primary architectural invariant is that **each project is independently demonstrable** for technology-specific evaluations (e.g. evaluating the Python extractor without spinning up PostgreSQL, Kafka, or React; or evaluating the Angular operations dashboard without the entire backend fleet). Standalone demonstrations use the exact same core business logic as platform mode, with external dependencies replaced by clearly labelled adapters or synthetic fixtures.

### Global Command Status Taxonomy

To maintain engineering honesty, all commands in this catalog are classified using three explicit tiers:
- **`[Verified]`**: A reported local check or CI test passed in the reviewed baseline (P03 commit `269e508` / P04 prototypes); not proof of full-stack runtime integration.
- **`[Observed-but-unverified]`**: Present in package scripts or configuration, executed but exhibiting known blockers/partial output or carried-forward runtime gaps.
- **`[Planned]`**: Designed for implementation in the owning feature phase (P05–P18); not yet working or implemented.

---

## 2. Service Directory & Phase Allocation

| Identifier | Service Name | Primary Stack | Owning Phase | Status Baseline |
|---|---|---|---|---|
| `service-resume` | Python Resume Extractor | Python 3.11, FastAPI, spaCy, pypdf, gRPC | P08 | Pytest passes (5/5); standalone HTML prototype (`GET /`, `GET /demo`) verified; pypdf digital text scope |
| `frontend-admin` | Angular Operations Dashboard | Angular 18, TypeScript, SCSS, RxJS, Socket.io | P12 | Production build passes; standalone operations console with live simulation adapter verified |
| `service-scraper` | Go Job Collection Engine | Go 1.23, Playwright-Go, Kafka-Go | P07 | `go test` and `go vet` pass cleanly; module mode verified |
| `service-user` | NestJS Identity & Profile API | NestJS 11, TypeScript, Prisma, PostgreSQL | P05 | ESLint passes (0 errors); tsc & Jest pass; Prisma migration 20261027000000_init established |
| `service-ingestion` | Node.js Job Ingestion & Search API | Node.js 22, Express, KafkaJS, MongoDB, ES 8.x | P07 | Aligned with Elasticsearch 8.x; 8 unit tests pass; owns unified `/api/v1/jobs` |
| `service-notification`| Node.js Notification Delivery Service | Node.js 22, Express, Socket.io, KafkaJS, Nodemailer | P11 | Safe jsonTransport default; 5 unit tests pass; Socket.io & metric counter verified |
| `frontend-next` | React/Next.js Candidate App | Next.js 16.3, React 19.2, TypeScript, ES 8.x | P06 | ESLint passes (0 errors); Turbopack build passes; complete responsive candidate prototype verified |

---

## 2.1 Authoritative Data Ownership & Persistence Matrix

Each domain entity has a single authoritative service owner, dedicated persistence store, and defined lifecycle:

| Domain Entity | Authoritative Owner | Storage Technology | Mutation Path | Lifecycle & Retention Policy | Deletion Propagation |
|---|---|---|---|---|---|
| **Candidate Accounts & Profiles** | `service-user` | PostgreSQL (`User`, `Profile`) | `PUT /api/v1/users/profile` | Retained while active; soft-delete on candidate request, hard-purge after 30-day grace period | Triggers cascade deletion of saved jobs, applications, alerts, and emits erasure event |
| **Saved Jobs & Searches** | `service-user` | PostgreSQL (`SavedJob`, `SavedSearch`) | `POST /api/v1/users/saved-jobs` | Bound to candidate account lifecycle | Purged immediately on account deletion |
| **Tracked Applications** | `service-user` | PostgreSQL (`Application`) | `POST /api/v1/users/applications` | Candidate-managed status history; retained until deleted by candidate | Purged immediately on account deletion |
| **Canonical Jobs Catalog** | `service-ingestion` | MongoDB (`jobs` collection) | Kafka event `job.collected.v1` | Retained 90 days post-expiry; deduplicated on `source_url_hash` | Marked `EXPIRED` if not seen in 14 days; purged via scheduled compaction |
| **Search Index Projections** | `service-ingestion` | Elasticsearch 8.x (`jobs_v1`) | Read-only projection of MongoDB | Ephemeral rebuildable projection; zero authoritative business state | Rebuilt from MongoDB canonical store upon corruption or schema reindex |
| **Raw Scraped HTML & Jobs** | `service-scraper` | Transient in-memory / Kafka buffer | Scraper worker crawl loops | Ephemeral; buffered in Kafka topic `job.collected.v1` (7-day broker retention) | Automatically pruned by Kafka partition log retention |
| **Resume Documents & Artifacts** | `service-user` / Object Store | S3 / MinIO private bucket | `POST /api/v1/users/resume/upload` | Text-layer PDF only; retained while candidate profile exists | Purged immediately upon candidate account deletion or resume replacement |
| **Extracted Skills** | `service-resume` (stateless) | Transient memory -> `service-user` | gRPC `ParseResume` | Stateless compute; extracted skills persisted in PostgreSQL by `service-user` | Managed under candidate profile lifecycle |
| **Notification Logs & Receipts** | `service-notification` | PostgreSQL / MongoDB logs | Kafka event `job.ingested.v1` | Delivery receipts and suppression records retained for 180 days for audit | Candidate email anonymized / suppressed upon account deletion |
| **Operator Audit Logs** | `service-user` / Gateway | PostgreSQL (`audit_logs`) | Privileged Admin API calls | Immutable append-only audit trail; retained 365 days | Anonymized actor IDs after retention period |

---

## 2.2 Authoritative Machine-Readable Contracts

All platform services interact through versioned machine-readable contracts located in [`contracts/`](contracts/):

- **OpenAPI 3.1 Launch Specification:** [`contracts/openapi/seekers-api-v1.yaml`](contracts/openapi/seekers-api-v1.yaml)
  - Defines all public, candidate, and operator endpoints under `/api/v1/*`.
  - Implements RFC 7807 structured error responses (`ErrorResponse`).
  - Standardizes cursor pagination, correlation IDs (`X-Correlation-ID`), and idempotency (`Idempotency-Key`).
- **Domain Event Schemas (Kafka):** [`contracts/events/`](contracts/events/)
  - Standard envelope: [`envelope.schema.json`](contracts/events/envelope.schema.json).
  - Scraper collection: [`job.collected.v1.schema.json`](contracts/events/job.collected.v1.schema.json).
  - Catalog ingestion: [`job.ingested.v1.schema.json`](contracts/events/job.ingested.v1.schema.json).
  - Resume extraction: [`resume.parsed.v1.schema.json`](contracts/events/resume.parsed.v1.schema.json).
  - Candidate registration: [`candidate.registered.v1.schema.json`](contracts/events/candidate.registered.v1.schema.json).
  - Alert dispatch: [`alert.dispatched.v1.schema.json`](contracts/events/alert.dispatched.v1.schema.json).
  - Synthetic positive and negative fixtures tested in CI: [`contracts/events/examples/`](contracts/events/examples/).
- **Protobuf Authority & Drift Control:** [`contracts/protobuf/resume/v1/resume.proto`](contracts/protobuf/resume/v1/resume.proto)
  - Authoritative source for ResumeParser gRPC interface.
  - Backwards-compatible evolution: preserves field numbers 1 and 2, adds `document_id` and `content_bytes`.
  - Automated drift detection checks synchronicity with `shared-protos/` and `service-user/proto/`.
- **Validation Runner:** Automated suite [`contracts/validate-contracts.js`](contracts/validate-contracts.js) runs in CI.

---

## 3. Individual Service Specifications

---

### 3.1 `service-resume` — Python Resume Extractor

- **Purpose & Role:** Ingests candidate resumes in text-layer digital PDF format, performs text extraction, and applies natural language processing (spaCy phrase matching) against a technical skills taxonomy to produce structured candidate skill profiles.
- **Primary Technology:** Python 3.11, FastAPI, `pypdf>=5.1.0`, spaCy (`en_core_web_sm`), gRPC (`grpcio`, `protobuf`).
- **Data Ownership:** Stateless compute worker; owns no permanent database. Temporarily processes in-memory byte buffers or secure object storage streams. Extracted skills are returned via gRPC/REST and persisted in PostgreSQL by `service-user`.
- **Scope Boundary (P03 Confirmed):** Text-layer digital PDFs only. Scanned image PDFs and encrypted documents are rejected with structured error codes (`SCANNED_PDF_NO_TEXT`, `ENCRYPTED_PDF`); OCR overhead is explicitly excluded from launch.
- **Entry Points & Interfaces:**
  - REST: `POST /parse` (FastAPI multipart/form-data upload), `GET /health`
  - gRPC: `ResumeParser.ParseResume` on port `50051` (implements authoritative `contracts/protobuf/resume/v1/resume.proto`)
  - Interactive Documentation: `GET /docs` (Swagger UI) and `GET /redoc`
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-resume/requirements.txt`
  - Runtime Protobuf Artifacts: `service-resume/resume_pb2.py`, `service-resume/resume_pb2_grpc.py`
  - Protobuf Source: `contracts/protobuf/resume/v1/resume.proto`
- **Commands & Verification:**
  - Test: `pytest test_main.py` — `[Verified]` (all 3 unit tests pass cleanly in local and Linux CI)
  - Local Run (HTTP): `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` — `[Verified]`
  - Local Run (gRPC): `python grpc_server.py` — `[Observed-but-unverified]`
- **Required Infrastructure:**
  - Standalone mode: None required (stateless Python process).
  - Integrated mode: gRPC consumer (`service-user`).
- **Current Verification Status:** All 3 pytest unit tests pass cleanly. `pypdf` upgrade eliminates PyPDF2 deprecation warnings. Docker packaging builds cleanly in multi-stage CI.
- **Standalone-Readiness Gaps (to complete in P08):**
  - Implement a dedicated Python-served HTML/CSS upload and interactive results presentation screen (using FastAPI HTMLResponse or Jinja2) so recruiters can evaluate Python extraction without running Node/Next.js/React.
  - Implement object-storage document identifier support (`document_id`) to deprecate host filesystem `/uploads` coupling.
  - Expand skill dictionary beyond initial 16 seed entries.
- **Planned Standalone Demonstration (P08):**
  - Lightweight, Python-served web interface serving a clean HTML/CSS upload and interactive skills extraction dashboard.
  - Preloaded synthetic sample resumes demonstrating skill extraction and unsupported format handling (scanned image rejection).
  - Downloadable structured JSON output and interactive OpenAPI Swagger documentation.
  - Zero external platform dependencies required to run the demo.
- **Intended Deployment Boundary:**
  - Docker container: `service-resume/Dockerfile`
  - Ports: `8000` (HTTP/REST), `50051` (gRPC)
  - Owning Feature Phase: **P08**

---

### 3.2 `frontend-admin` — Angular Operations Dashboard

- **Purpose & Role:** Provides operational monitoring, real-time job ingestion telemetry, and moderation tools for platform administrators. Preserved as Angular 18+.
- **Primary Technology:** Angular 18, TypeScript 5.5, SCSS, RxJS 7.8, Socket.io-client 4.8; uses modular components and reactive state.
- **Data Ownership:** UI presentation layer; owns no database persistence. Consumes live WebSocket events from `/socket.io/` via gateway and admin REST endpoints under `/api/v1/admin/*`.
- **Entry Points & Interfaces:**
  - Web UI: Port `4200` (local dev `ng serve`) / Port `4200` mapped from container port `80` (Docker Compose)
  - WebSocket Consumer: Connects to `/socket.io/` via API gateway (event: `live-job-feed`)
  - Admin REST: Interacts with `/api/v1/admin/*` contracts defined in `contracts/openapi/seekers-api-v1.yaml`
- **Dependency Manifests & Lockfiles:**
  - Manifest: `frontend-admin/package.json`
  - Lockfile: `frontend-admin/package-lock.json`
- **Commands & Verification:**
  - Build: `npm run build` — `[Verified]` (production compilation succeeds cleanly in CI)
  - Test: `npm run test:ci` — `[Observed-but-unverified]` (script added; requires headless Chrome in CI)
  - Local Dev: `npm start` (`ng serve`, port 4200) — `[Verified]`
- **Required Infrastructure:**
  - Planned standalone mode: Zero backend fleet required (uses synthetic simulated feed service).
  - Integrated mode: API gateway (`nginx`), `service-notification` (Socket.io), and admin API backends.
- **Current Verification Status:** Active service in `docker-compose.yml` with port 4200 mapped and Nginx WebSocket proxying configured. Production build compiles cleanly to `dist/frontend-admin/browser`.
- **Standalone-Readiness Gaps (to complete in P12):**
  - Implement synthetic simulation feed mode (`mock-live-feed.service.ts`) for recruiter evaluation without running Kafka/backends.
  - Implement full role-based auth guard for live admin mode with Firebase custom claims.
  - Replace placeholder charts with real SVG/Canvas telemetry components.
- **Planned Standalone Demonstration (P12):**
  - Self-contained synthetic demo mode streaming simulated job intake events with controlled pause/play/burst toggles.
  - Interactive job moderation table, source status cards, queue lag indicators, and audit log viewer.
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
- **Primary Technology:** NestJS 11, TypeScript 5.7, Prisma ORM 5.22, PostgreSQL 15, `@grpc/grpc-js`, Firebase Admin SDK.
- **Data Ownership:** Authoritative owner of PostgreSQL database `job_aggregator_users`. Owns tables for `User`, `Profile`, `SavedJob`, `TrackedApplication`, and `AlertSubscription`.
- **Entry Points & Interfaces:**
  - REST API: Port `3000` (internal) / Port `3002` (host) / `/api/v1/users/*` and `/api/users/*` via Nginx Gateway
    - `POST /users/sync`: Firebase JWT synchronization & account upsert
    - `POST /users/upload-resume`: Multi-part resume upload & gRPC dispatch to `service-resume`
    - Planned P05 endpoints: Full profile CRUD, saved jobs, tracked applications, and GDPR data erasure
  - gRPC Client: Connects to `service-resume` on `RESUME_GRPC_URL` using packaged `proto/resume.proto` (synced with `contracts/protobuf/resume/v1/resume.proto`)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-user/package.json`
  - Lockfile: `service-user/package-lock.json` (includes explicit `@emnapi/core` and `@emnapi/runtime` peer dependencies)
  - Prisma Migrations: `service-user/prisma/migrations/20261027000000_init/migration.sql`
- **Commands & Verification:**
  - Test: `npm test` — `[Verified]` (Jest unit tests pass)
  - Lint: `npm run lint` — `[Verified]` (all 59 ESLint errors and 3 warnings resolved; passes with 0 errors)
  - TypeScript Check: `npx tsc --noEmit` — `[Verified]` (clean compilation)
  - Prisma Generate: `npx prisma generate` — `[Verified]`
  - Migration Scripts: `npm run prisma:migrate`, `npm run prisma:baseline` — `[Verified]`
- **Required Infrastructure:**
  - Standalone mode: Dedicated PostgreSQL 15 container + Firebase Auth emulator.
  - Integrated mode: PostgreSQL, Firebase project credentials, `service-resume` gRPC endpoint.
- **Current Verification Status:** ESLint, TypeScript compilation, 25 Jest unit tests, and standalone smoke integration test (`npm run test:smoke`) pass cleanly. Forward-only migrations (`20261027000000_init`, `20261027100000_p05_identity_and_profiles`) deployed and verified against PostgreSQL. Docker packaging builds cleanly.
- **Completed in Phase P05:**
  - Idempotent Firebase-to-PostgreSQL synchronization (`POST /users/sync`).
  - Persistent candidate profile read & update (`GET/PUT /users/profile`).
  - Scheduled account deletion with 30-day grace period and idempotency (`POST /users/account/delete`).
  - Personal data export request tracking (`POST /users/account/export`).
  - Role-based server-side authorization enforcement (`RolesGuard` with `@Roles('ADMIN')`).
  - Standalone runner and integration test suite (`npm run test:smoke`) with Firebase Auth emulator on port 9099 and PostgreSQL.
- **Intended Deployment Boundary:**
  - Container: `service-user/Dockerfile`
  - Ports: `3000` (internal) / `3002` (host)
  - Owning Feature Phase: **P05 (Completed)**

---

### 3.5 `service-ingestion` — Node.js Job Ingestion & Search API

- **Purpose & Role:** Streaming consumer that ingests raw job listings from Kafka, normalizes URLs and fields, deduplicates records, persists canonical documents to MongoDB, and projects searchable records into Elasticsearch. Also serves the authoritative REST search API.
- **Primary Technology:** Node.js 22 LTS, Express 5.x, KafkaJS 2.x, MongoDB Node Driver 6.x, `@elastic/elasticsearch` ~8.15.0 (strictly aligned with Elasticsearch 8.10.2).
- **Data Ownership:** Single authoritative owner of canonical jobs catalog in MongoDB (`jobs` collection) and search projection in Elasticsearch (`jobs_index`).
- **Entry Points & Interfaces:**
  - Kafka Consumer: Topic `job.collected.v1` (legacy: `jobs.new`), Consumer Group `mongo-ingestion-group`
  - Kafka Producer: Emits `job.ingested.v1` upon successful persistence and indexing
  - REST API: Port `5000` (internal) / `/api/v1/jobs` and legacy `/api/jobs` via API Gateway
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-ingestion/package.json`
  - Lockfile: `service-ingestion/package-lock.json`
- **Commands & Verification:**
  - Test: `npm test` — `[Verified]` (8 real unit tests pass covering URL regex escaping, query sanitization, and health check)
  - Syntax Check: `node --check index.js` — `[Verified]`
  - Local Run: `node index.js` — `[Observed-but-unverified]`
- **Required Infrastructure:**
  - Standalone mode: MongoDB 6+ and Elasticsearch 8.x (with local JSON fixture replay adapter).
  - Integrated mode: Kafka broker (`jobs.new` / `job.collected.v1`), MongoDB, Elasticsearch.
- **Current Verification Status:** Upgraded to Node 22; `@elastic/elasticsearch` aligned to 8.x; 8 unit tests pass; Docker packaging passes in CI.
- **Standalone-Readiness Gaps (to complete in P07):**
  - Add deterministic JSON event replay adapter to demonstrate ingestion pipeline without running Kafka.
  - Implement full cursor-based pagination and facet queries defined in `contracts/openapi/seekers-api-v1.yaml`.
  - Implement durable dead-letter queue (DLQ) and retry backoff for unparseable job payloads.
- **Planned Standalone Demonstration (P07):**
  - CLI/script runner injecting synthetic Bangladesh tech jobs into ingestion pipeline.
  - Real-time MongoDB persistence and Elasticsearch search query demonstration with curl/OpenAPI examples.
  - Index rebuild and reconciliation drill demonstrating recovery of Elasticsearch from MongoDB.
- **Intended Deployment Boundary:**
  - Container: `service-ingestion/Dockerfile`
  - Ports: `5000` (internal) / mapped through Gateway
  - Owning Feature Phase: **P07**

---

### 3.6 `service-notification` — Node.js Notification Delivery Service

- **Purpose & Role:** Evaluates candidate alert preferences against newly ingested jobs, renders accessible branded notification templates, manages unsubscribe/suppression lists, and coordinates email and WebSocket alert delivery.
- **Primary Technology:** Node.js 22 LTS, Express 5.x, Socket.io 4.8, KafkaJS 2.x, Nodemailer 6.x, Prometheus Client (`prom-client`).
- **Data Ownership:** Notification delivery logs, candidate alert preferences cache, and suppression/unsubscribe tokens. Emits `alert.dispatched.v1`.
- **Entry Points & Interfaces:**
  - Kafka Consumer: Topic `job.ingested.v1` (legacy: `jobs.new`)
  - WebSocket Server: Port `4000` (serves `live-job-feed` through Gateway `/socket.io/`)
  - Metrics: `GET /metrics` on port `4000` (scraped by Prometheus)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-notification/package.json`
  - Lockfile: `service-notification/package-lock.json`
- **Commands & Verification:**
  - Test: `npm test` — `[Verified]` (5 real unit tests pass covering Express app, Socket.io server, metrics counter, and jsonTransport)
  - Local Dev: `node index.js` — `[Observed-but-unverified]`
- **Required Infrastructure:**
  - Standalone mode: Zero external infrastructure (uses jsonTransport and synthetic event replay).
  - Integrated mode: Kafka broker, Redis/Postgres for delivery logs, SMTP provider.
- **Current Verification Status:** Safe `jsonTransport` default prevents accidental email delivery; 5 unit tests pass cleanly; Prometheus metrics scrape target active; Docker image builds cleanly.
- **Standalone-Readiness Gaps (to complete in P11):**
  - Implement Mailpit/local sandbox mail capture UI for viewing rendered HTML alert emails.
  - Implement preference matching logic (matching candidate saved searches with job skills/locations).
  - Implement one-click signed unsubscribe token verification endpoint.
- **Planned Standalone Demonstration (P11):**
  - Synthetic event injection script demonstrating preference matching and alert dispatch.
  - Local Mailpit capture inbox displaying responsive HTML email templates with authentic Bangladesh tech job listings.
  - Real-time Socket.io feed displaying live alert metrics.
- **Intended Deployment Boundary:**
  - Container: `service-notification/Dockerfile`
  - Ports: `4000` (internal / host)
  - Owning Feature Phase: **P11**

---

### 3.7 `frontend-next` — React/Next.js Candidate App

- **Purpose & Role:** Primary public-facing candidate portal for discovering job opportunities, executing full-text searches, managing candidate authentication, and uploading resumes.
- **Primary Technology:** Next.js 16.3.0, React 19.2.8, TypeScript 5.x, Tailwind CSS / Vanilla CSS, Firebase Client SDK, `@elastic/elasticsearch` ~8.15.0.
- **Data Ownership:** Web presentation client; owns no database persistence. Caches search results and candidate profile in client state.
- **Search Transition Strategy (P03/P06):**
  - Legacy state: Server-side route `/api/jobs` queried Elasticsearch directly with an independent client.
  - Target architecture: `service-ingestion` is the single authoritative owner of search logic at `/api/v1/jobs` (and gateway `/api/jobs`).
  - Next.js transitions to consuming the unified gateway endpoint via client-side fetch or thin server action proxy, eliminating direct database coupling from the web tier.
- **Entry Points & Interfaces:**
  - Web UI: Port `3000` (local dev) / Port `3003` (Docker host port) / `http://localhost/` via Gateway
  - Public Client API: Consumes `/api/v1/jobs`, `/api/v1/jobs/{id}`, `/api/v1/users/*` via Nginx Gateway
- **Dependency Manifests & Lockfiles:**
  - Manifest: `frontend-next/package.json`
  - Lockfile: `frontend-next/package-lock.json` (synchronized with `@emnapi` Linux peer dependencies)
- **Commands & Verification:**
  - Lint: `npm run lint` — `[Verified]` (all 6 ESLint errors resolved in P02; passes with 0 errors)
  - Build: `npm run build` — `[Verified]` (Turbopack production compilation succeeds cleanly)
  - Local Dev: `npm run dev` — `[Verified]` (Next.js development server runs on port 3000)
- **Required Infrastructure:**
  - Standalone Demo mode: Zero external infrastructure (uses synthetic JSON job fixtures and mock auth mode).
  - Platform Integrated mode: API Gateway (`nginx`), `service-ingestion` for jobs, `service-user` for profile/auth.
- **Current Verification Status:** Rich UI components present (JobSearch, ResumeUpload, AuthComponent, Navbar). Lint and production builds pass cleanly in CI.
- **Standalone-Readiness Gaps (to complete in P06):**
  - Implement explicit `NEXT_PUBLIC_DEMO_MODE=true` toggle serving pre-seeded Bangladesh tech jobs.
  - Replace direct Elasticsearch connection in `app/api/jobs/route.ts` with gateway proxy.
  - Replace static marketing figures ("2.4M+ jobs", "180+ sources") with dynamic catalog telemetry.
- **Planned Standalone Demonstration (P06):**
  - Standalone Next.js candidate experience running entirely against bundled synthetic fixtures or mock handlers.
  - Fully responsive job search, filter panel (location, remote, salary, seniority), and candidate account workspace.
  - Clearly labelled UI demonstration mode ensuring zero unverified production claims.
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
