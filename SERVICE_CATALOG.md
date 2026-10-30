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
| `service-resume` | Python Resume Extractor | Python 3.11, FastAPI, spaCy, pypdf, gRPC | P08 | Pytest passes (16/16); standalone HTML app (`GET /`, `GET /demo`), real `/sample-resume.pdf` extraction, threadpool offloading, and gRPC verified |
| `frontend-admin` | Angular Operations Dashboard | Angular 19, TypeScript, SCSS, RxJS, Socket.io | P12 | Karma CI passes (58/58 tests); production build passes; standalone operations console with dual-adapter architecture, server-enforced RBAC, and real live operations verified across 6 operational routes (/overview, /sources, /catalog, /queues, /support, /audit) |
| `service-scraper` | Go Job Collection Engine | Go 1.23, Kafka-Go, SSRF Guard | P07 | `go test` passes (8/8) & `go vet` clean; source registry, durable leases, standalone CLI (`-mode=cli`, `-fixture`) verified |
| `service-user` | NestJS Identity & Profile API | NestJS 11, TypeScript, Prisma, PostgreSQL | P05 / P08 / P09 | ESLint passes (0 errors); tsc & Jest pass (59/59 across 7 suites); P09 candidate workspace, optimistic locking, saved searches, support triage verified |
| `service-ingestion` | Node.js Job Ingestion & Search API | Node.js 22, Express, KafkaJS, MongoDB, ES 8.x | P07 | 43 unit tests pass; recoverable consumer, dead-letter quarantine, outbox worker, reconcile, reindex, standalone event-runner verified |
| `service-notification`| Node.js Notification Delivery Service | Node.js 22, Express, Socket.io, KafkaJS, Nodemailer | P11 | 25 unit/crypto/matcher/storage/integration tests pass; Durable JSON store, preference matching, CAPTURE mailbox, HMAC-SHA256 unsubscribe verified |
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
  - Test: `pytest test_main.py` — `[Verified]` (all 16 unit tests pass cleanly covering extraction, technical Go disambiguation, 51-page truncation honesty, aliases, encrypted rejection, scanned rejection, raw path mode rejection, service token auth, and gRPC)
  - Local Run (HTTP): `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` — `[Verified]`
  - Local Run (gRPC): `python grpc_server.py` — `[Verified]`
- **Required Infrastructure:**
  - Standalone mode: None required (stateless Python process, zero external databases/queues).
  - Integrated mode: gRPC consumer (`service-user`).
- **Current Verification Status:** All 16 pytest unit tests pass cleanly. `pypdf` extraction eliminates PyPDF2 deprecation warnings. Standalone responsive UI (`GET /`, `GET /demo`), real synthetic sample PDF generation (`GET /sample-resume.pdf`), structured JSON download, threadpool event-loop offloading, and gRPC byte-buffer extraction verified. Docker packaging builds cleanly in multi-stage CI.
- **Completed in Phase P08:**
  - Dedicated Python-served HTML/CSS upload and interactive results presentation screen (`GET /`, `GET /demo`) enabling standalone recruiter evaluation without Node/Next.js/React.
  - Pure Python in-memory synthetic PDF generator and `/sample-resume.pdf` endpoint providing real PDF extraction without precomputed mock skills.
  - Structured JSON download and Swagger (`/docs`) / ReDoc (`/redoc`) OpenAPI documentation.
  - gRPC `ResumeParser.ParseResume` and REST `POST /parse` with in-memory byte buffer support (`content_bytes`), 16MB max message size limits, service token authorization (`RESUME_SERVICE_TOKEN`), and opaque `document_id`.
  - Canonical skill taxonomy with spaCy `PhraseMatcher`, contextual Go disambiguation, and comprehensive multi-token alias dictionary (`SKILL_ALIASES`).
  - Structured rejection of encrypted PDFs (`ENCRYPTED_PDF`), scanned image/empty PDFs (`SCANNED_PDF_NO_TEXT`), and 50+ page multi-page bounds (`PAGE_LIMIT_EXCEEDED`).
- **Intended Deployment Boundary:**
  - Docker container: `service-resume/Dockerfile`
  - Ports: `8000` (HTTP/REST), `50051` (gRPC)
  - Owning Feature Phase: **P08 (Completed)**

---

### 3.2 `frontend-admin` — Angular Operations Dashboard

- **Purpose & Role:** Provides operational monitoring, real-time job ingestion telemetry, and moderation tools for platform administrators. Preserved as Angular 18+.
- **Primary Technology:** Angular 18, TypeScript 5.5, SCSS, RxJS 7.8, TailwindCSS 3.4; modular architecture with dual-adapter pattern (`DemoOperationsAdapter` and `LiveOperationsAdapter`).
- **Data Ownership:** UI presentation layer; owns no database persistence. Consumes live WebSocket events from `/socket.io/` via gateway and admin REST endpoints under `/api/v1/admin/*`.
- **Entry Points & Interfaces:**
  - Web UI: Port `4200` (local dev `ng serve`) / Port `4200` mapped from container port `80` (Docker Compose)
  - WebSocket Consumer: Connects to `/socket.io/` via API gateway (event: `live-job-feed`)
  - Admin REST: Interacts with `/api/v1/admin/*` contracts defined in `contracts/openapi/seekers-api-v1.yaml`
- **Dependency Manifests & Lockfiles:**
  - Manifest: `frontend-admin/package.json`
  - Lockfile: `frontend-admin/package-lock.json`
- **Commands & Verification:**
  - Build: `npm run build` — `[Verified]` (production compilation succeeds cleanly in CI with zero warnings on Angular 19 toolchain)
  - Test: `npm run test:ci` — `[Verified]` (58/58 unit and integration tests passing in headless Chrome)
  - Local Dev: `npm start` (`ng serve`, port 4200) — `[Verified]`
- **Required Infrastructure:**
  - Standalone mode: Zero backend fleet required (uses 100% self-contained deterministic in-memory simulator with Bangladesh tech ecosystem data).
  - Integrated mode: API gateway (`nginx`), `service-ingestion` (`/api/v1/admin/*`), `service-user` (`/api/v1/admin/reports`), and `service-notification` (Socket.io).
- **Current Verification Status:** Fully verified operational dashboard with 6 functional views (`/overview`, `/sources`, `/catalog`, `/queues`, `/support`, `/audit`), server-enforced role boundaries (`ADMIN`, `OPERATOR`, `READ_ONLY`), real crawler operations, privileged catalog search, atomic versioned moderation, and standalone demonstration mode preloaded with Bangladesh tech ecosystem data.
- **Standalone Demonstration Features (Delivered P12):**
  - Self-contained synthetic demo mode streaming simulated job intake events with controlled pause/play/burst toggles.
  - Interactive job moderation table, source status cards, queue lag indicators, support triage queue, and immutable audit log viewer.
  - Independent recruiter evaluation without operating Kafka, Elasticsearch, or backend services.
- **Intended Deployment Boundary:**
  - Multi-stage Nginx container: `frontend-admin/Dockerfile`
  - Ports: `4200` (host mapping) -> `80` (container internal)
  - Owning Feature Phase: **P12 (Repaired & Completed)**

---

### 3.3 `service-scraper` — Go Job Collection Engine

- **Purpose & Role:** Automated job collection engine that harvests job listings from approved sources, cleans and normalizes HTML/JSON data into versioned domain event envelopes (`job.collected.v1`), and publishes events to Kafka with durable lease scheduling and offline CLI support.
- **Primary Technology:** Go 1.23, Segmentio Kafka-Go v0.4.51, Playwright-Go v0.6100.0, SafeHTTPClient with DNS SSRF guard.
- **Data Ownership:** Stateless collector. Reads external approved web/feed sources; emits versioned `SeekersEventEnvelope` JSON events to Kafka topic `job.collected.v1` (with backward-compatible emission to `jobs.new`). Checkpoints and leases persisted durably in `./data/state`.
- **Entry Points & Interfaces:**
  - Kafka Producer: Publishes to topic `job.collected.v1` (partitioned on `source_url_hash`)
  - CLI: Standalone collection executable supporting `-mode=cli`, `-fixture=<path>`, `-format=json|ndjson`, `-output=stdout|file|kafka`
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-scraper/go.mod`
  - Lockfile: `service-scraper/go.sum`
  - Dependency Policy: Module-based retrieval (`go.mod` / `go.sum`).
- **Commands & Verification:**
  - Test: `go test -v ./...` — `[Verified]` (all 9 unit tests pass cleanly: SSRF with initial request and connection pinning, parsers, drift, monotonic scheduler leases, fixtures)
  - Vet: `go vet ./...` — `[Verified]` (passes with zero defects)
  - Standalone CLI: `go run . -mode=cli -fixture=fixtures/greenhouse_sample.json -format=json` — `[Verified]` (zero network/Kafka dependency)
  - Source Registry: `go run . -list-sources` — `[Verified]` (lists operational status and permissions for all registered sources)
- **Required Infrastructure:**
  - Standalone mode: None (100% offline fixture execution).
  - Integrated mode: Apache Kafka broker (`KAFKA_BROKER`).
- **Completed in Phase P07:**
  - Evidence-backed source registry (`registry.go`) defining operational configurations for `greenhouse-feed`, `lever-feed`, `bdjobs-tech`, `chaldal-careers`, `pathao-careers`, and `fixture-local`.
  - Server-Side Request Forgery (SSRF) Guard (`ssrf.go`) blocking IPv4/IPv6 private ranges, loopback, cloud metadata (`169.254.169.254`), carrier-grade NAT, and single-label intranet hosts, with redirect revalidation.
  - Durable scheduler store (`scheduler.go`) with file-backed leases, lease conflict prevention, lease expiry, and checkpoints.
  - Rate limiting with token bucket, exponential backoff, and jitter.
  - Versioned `SeekersEventEnvelope` (`models.go`, `publisher.go`) conforming to `contracts/events/envelope.schema.json` and `job.collected.v1.schema.json`.
  - Standalone CLI with exit codes 0 (success), 1 (fatal error), and 2 (schema drift warning).
- **Intended Deployment Boundary:**
  - Container: `service-scraper/Dockerfile`
  - Owning Feature Phase: **P07 (Completed)**

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
- **Current Verification Status:** ESLint (non-mutating), TypeScript compilation, 112 Jest unit tests across 10 suites (including dedicated `p13-qualification.spec.ts`), negative error-handling verification (`npm run test:smoke:negative`), and strict standalone smoke integration test (`npm run test:smoke`) pass cleanly in local and CI pipelines. Forward-only migrations (`20261027000000_init`, `20261027100000_p05_identity_and_profiles`, `20261028000000_p08_resume_documents_and_lifecycle`, `20261029000000_p09_candidate_workspace_and_support`, `20261030000000_p10_recommendations_and_feedback`) deployed and verified against PostgreSQL. Docker packaging builds cleanly.
- **Completed in Phases P05, P08, P09, P10 & P13:**
  - Idempotent Firebase-to-PostgreSQL synchronization (`POST /users/sync`).
  - Persistent candidate profile read & update (`GET/PUT /users/profile`).
  - Scheduled account deletion with 30-day grace period and idempotency (`POST /users/account/delete`).
  - P13 Account Deletion Cancellation (`POST /users/account/cancel-deletion`): Cancels active pending deletion during 30-day grace period, restoring status to active.
  - P13 Asynchronous Account Erasure Purge Worker: Identifies due deletion requests, removes physical resume files from private object storage, and cascades deletion of user records and all related rows from PostgreSQL.
  - P13 Portable Data Export & Secure Download (`POST /users/account/export` and `GET /users/account/export/:id/download`): Packages complete personal data, persists archive to private storage, and streams download with strict owner-only authorization (preventing foreign-tenant snooping).
  - Role-based server-side authorization enforcement (`RolesGuard` with `@Roles('ADMIN')`, `OPERATOR`, `READ_ONLY`).
  - P08 Account-owned private resume storage (`StorageService`) with `%PDF` magic bytes validation, 10MB bounds, SHA256 checksums, strict containment with separator, and safe key grammar to prevent directory traversal and sibling escapes.
  - P08 Asynchronous parsing lifecycle (`ResumeDocument`, `ResumeParseResult`), durable worker dispatch with lease fencing (`fenceToken`), recovery loop, and polling status endpoint (`GET /users/resume/status/:parseId`).
  - P08 Active resume query endpoint (`GET /users/resume`) for state hydration and UI synchronization.
  - P08 Candidate review checklist endpoint (`POST /users/resume/review`) allowing selective skill application to profile without silent clobbering.
  - P08 Candidate resume deletion (`DELETE /users/resume`) with atomic superseding tombstones and authorized stream download (`GET /users/resume/download`).
  - P09 Candidate Workspace: Saved/unsaved jobs (`/users/saved-jobs`), cursor pagination lookahead fix, catalog TTL cache, and accurate listing availability checking.
  - P09 Saved Searches: Full CRUD (`/users/saved-searches`) with query and filter persistence, alert configuration, and execution deep links.
  - P09 Application Tracker: Candidate-managed tracking (`/users/applications`) with atomic database-level optimistic concurrency control (`expected_version` -> 409 Conflict), state machine transition history, and idempotent creation.
  - P09 Support & Moderation: Support report submission (`POST /reports`) with optional auth guard (rejects malformed tokens with 401; allows anonymous with IP hash), durable `RPT-YYYYMMDD-XXXX` receipts, reporter status lookup, and role-enforced admin triage queue (`/admin/reports`).
  - P09 Account export extended to package all personal workspace entities (`saved_jobs`, `saved_searches`, `applications`, `reports`) while omitting internal operator notes and IP hashes.
  - P10 Explainable Recommendations & Matching: Deterministic scoring engine (`recommendation-engine.ts`) version `v1.0.0-deterministic` grounded strictly in reviewed candidate profile skills, location/remote constraints, and pay-period normalized compensation without hallucinated claims.
  - P10 Strict Hard Exclusions: Zero tolerance for inactive/flagged/draft/expired listings, candidate-dismissed jobs, `ON_SITE`/`HYBRID` listings for `FULLY_REMOTE` candidates, geographic city mismatches for `ON_SITE` candidates, and monthly normalized compensation below minimum requirements.
  - P10 Recommendation Feedback & Dismissal (`RecommendationFeedback`): Endpoints `POST/DELETE /users/recommendations/:jobId/feedback` with candidate isolation, atomic upserts, and immediate cache invalidation.
  - P10 Versioned Cursor Security: Base64 JSON cursors cryptographically validated against candidate ownership, algorithm version, and profile update timestamps (rejects malformed/foreign/stale cursors with 400 Bad Request).
  - P10 Quality & Evaluation Benchmark: 11 candidate profiles evaluated against 22 catalog listings (`recommendation-evaluation.spec.ts`) verifying 0.0% hard exclusion violations, 100% P@1, >=85% P@3, 100% grounded explanations, and bounded latency (< 20ms across 50 runs).
  - Standalone runner and integration test suite (`npm run test:smoke`) extended to 39 verification steps.
  - Negative error handling regression suite (`npm run test:smoke:negative`) ensuring no false-positive test reporting.
  - Automated CI integration job running database migrations, Python gRPC extractor, and strict smoke tests against isolated PostgreSQL container and Firebase Auth Emulator.
- **Intended Deployment Boundary:**
  - Container: `service-user/Dockerfile`
  - Ports: `3000` (internal) / `3002` (host)
  - Owning Feature Phase: **P05, P08 & P09 (Completed)**

---

### 3.5 `service-ingestion` — Node.js Canonical Job Catalog & Unified Search API

- **Purpose & Role:** Streaming consumer that ingests raw job listings from Kafka, normalizes URLs and fields, deduplicates records, persists canonical documents to MongoDB (authoritative catalog), and projects searchable records into Elasticsearch (rebuildable index with MongoDB fallback). Also serves the platform-wide unified REST search API.
- **Primary Technology:** Node.js 22 LTS, Express 5.x, KafkaJS 2.x, MongoDB Node Driver 6.x, `@elastic/elasticsearch` ~8.15.0 (strictly aligned with Elasticsearch 8.10.2).
- **Data Ownership:** Single authoritative owner of canonical jobs catalog in MongoDB (`jobs` collection) and search projection in Elasticsearch (`jobs_index`).
- **Entry Points & Interfaces:**
  - Kafka Consumer: Topic `job.collected.v1` (legacy: `jobs.new`), Consumer Group `mongo-ingestion-group`
  - Kafka Producer: Emits `job.ingested.v1` upon successful persistence and indexing
  - REST Search API: Port `5000` (internal) / `/api/v1/jobs` and legacy `/api/jobs` via API Gateway
  - REST Detail API: `GET /api/v1/jobs/:id` (canonical listing details; 404 RFC 7807 if not found)
  - REST Outbound API: `GET /api/v1/jobs/:id/outbound` (safe 302 redirect for HTML or 200 `{ destination_url }` for JSON)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-ingestion/package.json`
  - Lockfile: `service-ingestion/package-lock.json`
- **Commands & Verification:**
  - Unit Tests: `npm test` — `[Verified]` (56 unit tests covering URL normalization, regex escaping, stable UUIDs, IPv6 ULA/loopback outbound safety, query validation, authoritative schema validation, dead-letter quarantine, atomic Mongo revisions with salary/skills/moderation/stale protection, monotonic search projection guards, and zero-downtime reindex/reconciliation)
  - Integration Tests: `npm run test:integration` — `[Verified]` (strict integration tests against isolated test MongoDB database and isolated Elasticsearch index, verifying event ingestion, dead-letter quarantine, outbox flushing, and catalog reconciliation)
  - Standalone Seed: `npm run seed` — `[Verified]` (seeds 12 curated Bangladesh tech jobs with explicit `is_synthetic` provenance into MongoDB and ES)
  - Standalone Event Runner: `npm run event-runner -- --file=test/fixtures/collected_events.ndjson` — `[Verified]` (processes NDJSON event streams into Mongo and ES without Kafka)
  - Operator CLI: `npm run operator -- status`, `dead-letters`, `reconcile`, `reindex` — `[Verified]`
  - Standalone Run: `npm run start:standalone` (`node bin/standalone.js`) — `[Verified]` (runs search API without Kafka)
- **Required Infrastructure:**
  - Standalone mode: MongoDB 6+ and Elasticsearch 8.x (zero Kafka dependency required to run search API or event runner).
  - Integrated mode: Kafka broker (`job.collected.v1`), MongoDB, Elasticsearch.
- **Current Verification Status:** Node 22, Express 5, 43 unit tests passing; CI updated to run MongoDB/Elasticsearch services and integration tests; Docker packaging passes in CI.
- **Completed in Phase P06 & P07:**
  - Canonical job catalog persistence in MongoDB with unique indexes on `id`, `canonical_url`, and `source_url_hash`.
  - Event schema validation (`src/events/validator.js`) conforming to `envelope.schema.json` and `job.collected.v1.schema.json`.
  - Poison message isolation: malformed events quarantined to `dead_letters` collection before advancing Kafka offsets.
  - Manual Kafka offset commits: offsets committed only after durable Mongo write or dead-letter quarantine (no swallowed errors).
  - Idempotent upserts: duplicate events preserve `first_seen_at` without bumping revisions or dirtying search projections.
  - Projection outbox worker (`src/search/projection-worker.js`) projecting `PENDING` MongoDB records to Elasticsearch with optimistic concurrency revision checks.
  - Catalog reconciliation (`src/search/reconcile.js`) detecting and repairing missing, stale, excess, and status-misaligned documents.
  - Zero-downtime reindexing (`src/search/reindex.js`) with versioned indexes and atomic alias swaps.
  - Deterministic keyset cursor pagination (`cursor`) for `date_desc`, `salary_desc`, and `relevance` with unified schema and query binding.
  - Full filter suite (`q`, `location`, `remote_eligibility`, `job_type`, `seniority`, `min_salary`, `currency`).
  - Safe outbound URL validation rejecting IPv4 and IPv6 private/loopback/ULA/link-local IPs and single-label hosts while permitting valid domains with "data" substrings.
  - Outbound lifecycle enforcement rejecting expired and flagged listings with RFC 7807 problem details.
  - Transparent search engine fallback to MongoDB if Elasticsearch is unavailable.
- **Intended Deployment Boundary:**
  - Container: `service-ingestion/Dockerfile`
  - Ports: `5000` (internal) / mapped through Gateway
  - Owning Feature Phase: **P07 (Completed)**

---

### 3.6 `service-notification` — Node.js Notification Delivery Service

- **Purpose & Role:** Evaluates candidate alert preferences against newly ingested jobs, renders accessible branded notification templates, manages unsubscribe/suppression lists, and coordinates email and WebSocket alert delivery.
- **Primary Technology:** Node.js 22 LTS, Express 5.x, Socket.io 4.8, KafkaJS 2.x, Nodemailer 9.x, Prometheus Client (`prom-client`).
- **Data Ownership:** Notification delivery logs, candidate alert preferences cache, suppression records, and captured message envelopes in crash-safe atomic store (`data/notifications_store.json`). Emits `alert.dispatched.v1`.
- **Entry Points & Interfaces:**
  - Kafka Consumer: Topic `job.ingested.v1` (legacy: `jobs.new`)
  - WebSocket Server: Port `4000` (serves `live-job-feed` through Gateway `/socket.io/`)
  - Metrics: `GET /metrics` on port `4000` (scraped by Prometheus)
  - REST API: `/api/v1/notifications/*` (captured emails, unsubscribe flow, provider webhooks, evaluations)
  - Standalone Showcase CLI: `service-notification/cli.js` (`replay`, `captured`, `captured-show`, `unsubscribe`, `stats`)
- **Dependency Manifests & Lockfiles:**
  - Manifest: `service-notification/package.json`
  - Lockfile: `service-notification/package-lock.json`
- **Commands & Verification:**
  - Test: `npm test` — `[Verified]` (44 tests pass cleanly across 8 suites covering HTTP endpoints, crypto & token security with dedicated candidate session tokens, preference matcher, HTML/text templates, atomic storage locking with fencing & corrupt isolation, digests, outbox sync tasks, and full integration lifecycle)
  - Local Dev / Standalone Replay: `node cli.js replay` — `[Verified]`
  - CLI Mailbox Inspection: `node cli.js captured` — `[Verified]`
- **Required Infrastructure:**
  - Standalone mode: Zero external infrastructure (`CAPTURE` mode with atomic file/in-memory storage).
  - Integrated mode: Kafka broker, SMTP provider or Mailpit sandbox, `service-user` PostgreSQL synchronization.
- **Current Verification Status:** `[Verified]` — 44 tests pass cleanly across 8 suites; zero external network dependencies in `CAPTURE` mode; tamper-resistant HMAC-SHA256 unsubscribe tokens with mandatory finite expiration; RFC 8058 one-click unsubscribe support; authenticated candidate WebSocket rooms; atomic cross-process file locking with fencing tokens and corrupt file recovery; durable background retry and digest worker; contract-conformant `alert.dispatched.v1` events.
- **Intended Deployment Boundary:**
  - Container: `service-notification/Dockerfile`
  - Ports: `4000` (internal / host)
  - Owning Feature Phase: **P11 (Completed & Repaired)**

---

### 3.7 `frontend-next` — React/Next.js Candidate App

- **Purpose & Role:** Primary public-facing candidate portal for discovering job opportunities, executing multi-faceted searches, viewing shareable job details with structured data, managing candidate authentication, and uploading resumes.
- **Primary Technology:** Next.js 16.3.0, React 19.2.8, TypeScript 5.x, Vanilla CSS / design tokens, Firebase Client SDK. (Direct `@elastic/elasticsearch` dependency removed).
- **Data Ownership:** Web presentation client; owns no database persistence. Caches search results and candidate profile in client state.
- **Search Architecture (P06 Complete):**
  - Fully decoupled from direct database connections: proxies `/api/v1/jobs`, `/api/v1/jobs/[id]`, `/api/v1/jobs/[id]/outbound`, and legacy `/api/jobs` through to `service-ingestion` (`INGESTION_API_URL`).
  - Next.js server handles manual redirect forwarding for safe 302 outbound application journeys.
  - Candidate portal UI communicates exclusively through live API endpoints with bounded retry and honest error states.
- **Entry Points & Interfaces:**
  - Web UI: Port `3000` (local dev) / Port `3003` (Docker host port) / `http://localhost/` via Gateway
  - Shareable Detail Route: `/jobs/[id]` (SSR with OpenGraph metadata, JSON-LD `JobPosting` schema, custom 404 page)
  - Public Client API: Proxies `/api/v1/jobs`, `/api/v1/jobs/{id}`, `/api/v1/users/*` via Nginx Gateway
- **Dependency Manifests & Lockfiles:**
  - Manifest: `frontend-next/package.json`
  - Lockfile: `frontend-next/package-lock.json`
- **Commands & Verification:**
  - Lint: `npm run lint` — `[Verified]` (0 errors, 0 warnings across all components and pages)
  - Test: `npm test` — `[Verified]` (runs both `auth-provider-regression.mjs` and `job-search-regression.mjs`; all 9 regressions pass)
  - Build: `npm run build` — `[Verified]` (Turbopack production compilation succeeds cleanly)
  - Local Dev: `npm run dev` — `[Verified]` (Next.js development server runs on port 3000/3003)
- **Required Infrastructure:**
  - Standalone Demo mode: Zero external infrastructure (toggleable via `?demo=true` or in-app button).
  - Platform Integrated mode: `service-ingestion` for jobs/search, `service-user` for profile/auth.
- **Current Verification Status:** 0 lint errors/warnings, 9 regression tests passing, production build passing, mobile/desktop visual and interaction inspections verified via browser subagent.
- **Completed in Phase P06:**
  - Direct Elasticsearch dependency removed; Next.js routes proxy cleanly to `service-ingestion`.
  - Public shareable `/jobs/[id]` route implemented with dynamic OpenGraph metadata and JSON-LD `JobPosting` structured data.
  - Dedicated custom 404 page for unavailable/expired listings.
  - Interactive Job Detail Drawer with verified outbound apply link (`/api/v1/jobs/:id/outbound`) and permalink copy.
  - Keyset pagination controls (Next/Previous) with cursor query parameter tracking.
  - Standalone portfolio demo mode toggle preserved and isolated with prominent amber banner.
  - Zero mobile horizontal overflow (`scrollWidth <= innerWidth`) verified at 390px and 360px viewports.
- **Intended Deployment Boundary:**
  - Container: `frontend-next/Dockerfile`
  - Ports: `3000` (internal) / `3003` (host)
  - Owning Feature Phase: **P06 (Completed)**

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

## 5. Security, Privacy & Accessibility Baseline (P13 Qualified)

1. **Remote Repository URL:** Configured with clean, credential-free URL (`https://github.com/mkamrul9/job-aggregator-platform.git`) using Git Credential Manager (`manager`). No credentials embedded in Git configuration.
2. **Environment Files:** All `.env` and `.env.*` files are untracked and ignored via root and service-level `.gitignore` files.
3. **Configuration Examples:** Tracked examples contain variables actually consumed by a current service or SDK. Production modes fail closed on missing or default secrets (`ADMIN_KEY`, `AUTH_SECRET`).
4. **Local Secrets:** Kept strictly local (e.g. `.secrets`, `docs/token_cmd.txt` are gitignored).
5. **P13 Privacy & Data Retention:** Complete asynchronous account erasure with 30-day grace period, cancellation before grace expiration, controllable reference clock purge worker (deleting database rows and physical private storage files), and portable personal data export with owner-only streaming download.
6. **P13 Storage Hardening & SSRF Defense:** Storage keys enforce strict grammar rejecting path traversal, absolute paths, and sibling directory escapes. Resumes validate `%PDF` magic bytes and 10MB bounds. Outbound destination URLs reject loopback, RFC 1918 private subnets, AWS metadata (`169.254.169.254`), ULA IPv6, single-label intranets, and user:pass credentials. JSON-LD serialization escapes script tags (`\u003c/script\u003e`).
7. **P13 Accessibility Target (WCAG 2.2 AA):** Semantic landmarks (`<header role="banner">`, `<main id="main-content">`, `<nav aria-label="...">`, `<footer role="contentinfo">`), skip to content links across Next.js candidate app, Angular admin, and Python standalone UI, accessible names on all inputs and icon buttons, modal dialog attributes (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `Escape` key close), table header scopes (`scope="col"`), and status announcements (`aria-live="polite"`).
